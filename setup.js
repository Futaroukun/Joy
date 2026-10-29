import { spawn } from "child_process";

const args = process.argv.slice(2);

function runNpm(npmArgs) {
    return new Promise((resolve) => {
        const proc = spawn("npm", npmArgs, {
            stdio: ["inherit", "inherit", "pipe"]
        });

        let stderr = "";
        proc.stderr.on("data", (chunk) => {
            stderr += chunk.toString();
            process.stderr.write(chunk);
        });

        proc.on("close", (code) => {
            resolve({ code, stderr });
        });
    });
}

function analyzeErrors(errorText) {
    const isEresolve = errorText.includes("ERESOLVE");
    const isEallowgit = errorText.includes("EALLOWGIT") || errorText.includes("Fetching packages of type \"git\" have been disabled");

    if (!isEresolve && !isEallowgit) return null;

    const flags = [];
    const messages = [];

    if (isEresolve) {
        flags.push("--legacy-peer-deps");
        const requester = errorText.match(/While resolving:\s*([^\s\n]+)/)?.[1] || "Modul eksternal";
        const current   = errorText.match(/Found:\s*([^\s\n]+)/)?.[1] || "Versi terpasang";
        const required  = errorText.match(/Conflicting peer dependency:\s*([^\s\n]+)/)?.[1]
            || errorText.match(/peer(?:Optional)?\s+([^\s\n]+)/)?.[1]
            || "Versi tidak kompatibel";

        messages.push(
            "[PERINGATAN KONFLIK DEPENDENSI]\n" +
            "Terjadi bentrok versi modul pada proyek:\n" +
            `- Modul Peminta : ${requester}\n` +
            `- Versi Diminta : ${required}\n` +
            `- Versi Saat Ini: ${current}`
        );
    }

    if (isEallowgit) {
        flags.push("--allow-git=all");
        const pkgMatch = errorText.match(/Refusing to fetch "([^"]+)"/)?.[1] || "git dependency";
        messages.push(
            "[PERINGATAN KEBIJAKAN GIT NPM]\n" +
            "NPM v12+ memblokir instalasi modul dari Git eksternal:\n" +
            `- Dependensi Terblokir: ${pkgMatch}`
        );
    }

    return { flags, message: messages.join("\n\n") };
}

async function verifyNativeAddons() {
    const nativePkgs = ["better-sqlite3"];
    for (const pkg of nativePkgs) {
        try {
            await import(pkg);
        } catch (err) {
            if (
                err.message?.includes("Could not locate the bindings file") ||
                err.code === "ERR_DLOPEN_FAILED" ||
                err.message?.includes("NODE_MODULE_VERSION")
            ) {
                console.log(`\n[INSTALL] Native addon '${pkg}' belum terkompilasi. Mengompilasi binary...`);
                await runNpm(["rebuild", pkg, "--allow-scripts"]);
            }
        }
    }
}

async function smartInstall() {
    console.log("[INSTALL] Memulai instalasi dependensi...");
    const initialArgs = ["install", ...args];
    const firstTry = await runNpm(initialArgs);

    if (firstTry.code === 0) {
        await verifyNativeAddons();
        console.log("[INSTALL] Instalasi selesai.");
        return process.exit(0);
    }

    const analysis = analyzeErrors(firstTry.stderr);
    if (analysis && analysis.flags.length > 0) {
        console.log("\n" + analysis.message + "\n");
        console.log(`Mencoba ulang instalasi otomatis dengan opsi: ${analysis.flags.join(" ")}...`);

        const fallbackArgs = ["install", ...analysis.flags, ...args];
        const retry = await runNpm(fallbackArgs);

        if (retry.code === 0) {
            await verifyNativeAddons();
            console.log("\n[INSTALL] Instalasi berhasil diselesaikan.");
            return process.exit(0);
        } else {
            console.error(`\n[INSTALL ERROR] Gagal menginstal meskipun sudah menggunakan opsi ${analysis.flags.join(" ")}.`);
            return process.exit(retry.code || 1);
        }
    }

    process.exit(firstTry.code || 1);
}

smartInstall();
