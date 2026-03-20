document.addEventListener("DOMContentLoaded", function () {
    // These must match your folder names in packages/*
    const PACKAGES = ["adk", "core"]; 
    const pathParts = window.location.pathname.split("/").filter((p) => p && p !== "index.html");

    let currentVersion = "latest";
    let currentPackage = "core";
    let versionIndex = -1;

    for (let i = 0; i < pathParts.length; i++) {
        if (PACKAGES.includes(pathParts[i])) {
            currentPackage = pathParts[i];
            if (i > 0) {
                currentVersion = pathParts[i - 1];
                versionIndex = i - 1;
            }
            break;
        }
    }

    let rootPath = "";
    if (versionIndex !== -1) {
        let depth = pathParts.length - versionIndex;
        for (let i = 0; i < depth; i++) rootPath += "../";
    }
    if (rootPath === "") rootPath = "./";

    fetch(rootPath + "versions.json")
        .then((r) => r.json())
        .then((versions) => {
            injectVersionMenu(versions, currentVersion, currentPackage, rootPath, PACKAGES);
        });
});

function injectVersionMenu(versions, currentVersion, currentPackage, rootPath, allPackages) {
    const menu = document.createElement("div");
    // Styling it to look like a floating badge since TypeDoc doesn't have a footer sidebar by default
    menu.style = "position:fixed;bottom:20px;right:20px;background:#232323;color:white;padding:12px;border-radius:8px;font-family:sans-serif;font-size:12px;z-index:1000;box-shadow:0 4px 12px rgba(0,0,0,0.3);border:1px solid #444;";
    
    menu.innerHTML = `
        <div style="margin-bottom:8px;font-weight:bold;color:#ffa600;">SDK Documentation</div>
        <div style="margin-bottom:4px;">Version: <b>${currentVersion}</b></div>
        <select onchange="window.location.href=this.value" style="background:#444;color:white;border:none;width:100%;padding:4px;border-radius:4px;">
            ${versions.map(v => `<option value="${rootPath}${v}/${currentPackage}/index.html" ${v === currentVersion ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
        <div style="margin-top:8px;border-top:1px solid #444;padding-top:8px;">
            ${allPackages.map(p => `<a href="${rootPath}${currentVersion}/${p}/index.html" style="color:${p === currentPackage ? '#ffa600' : '#aaa'};text-decoration:none;display:block;margin-bottom:2px;">${p} ${p === currentPackage ? '✓' : ''}</a>`).join('')}
        </div>
    `;
    document.body.appendChild(menu);
}
