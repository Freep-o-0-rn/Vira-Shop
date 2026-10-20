# Vira Shop — Windows compatibility and startup errors

## Supported operating systems
Vira Shop 0.15.2 uses Next.js 16, Node.js 22+ and PowerShell 5.1.
Run it on **64-bit Windows 10/11** with a supported Node.js 22+ release, or deploy
the app to a suitable Linux server. **Windows 7, 8 and 8.1 cannot run the
current project.** Installing an obsolete Node.js version is not a workaround.

To identify Windows, press **Win+R**, enter `winver`, and check the version.
On a compatible Windows open **cmd.exe** and run:

```cmd
node --version
npm --version
where node
where npm
```

If the commands are missing, install or repair a supported Node.js Windows x64
package from https://nodejs.org/, ensuring npm and PATH are configured. Close
all command windows and open a new one to pick up the updated PATH.

## Errors seen in older Windows versions

- `Split-Path: Cannot bind argument ... Path is null`: the old startup script
  relied on `$PSScriptRoot`, which did not exist in PowerShell 2.0. The
  launcher now derives its own path and shows the unsupported-Windows warning.
- `'npm' is not recognized`: npm cannot be located in the PATH, or Node.js is
  not installed. The database launcher now performs the same preflight checks
  as the server launcher before calling npm.
- `The system cannot write to the specified device`: may involve an older
  console/PowerShell. The batch launchers no longer force UTF-8 code page 65001.
  If it persists, report the complete console output and Windows version.

The diagnostics check never changes the database. When the launcher
continues successfully, database files are stored in `data/pgdata`.

## Preserve your data

If you already have products, orders or photos, **do not delete the old
folder** and do not overwrite `data/` or `public/uploads/`.
Install the new version in a separate folder, close both server instances,
run `IMPORT-DATA-WINDOWS.bat`, then `START-WINDOWS.bat`.

If the machine runs Windows 7, do not attempt to run Vira Shop locally.
Move the project and saved data to a compatible Windows 10/11 computer or a
Linux server. Back up the old data first and keep the old copy until the new
site has been verified.
