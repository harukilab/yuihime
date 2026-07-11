# Welcome to Yuihime Interactive Core Terminal Space!
This workspace resides dynamically in `YUIHIME_USER_DATA_PATH` (normally `./.yuihime/user_data/`).

From this space, you can run bash commands, write Node/JS scripts, and customize tools.
Your shell commands execute with full environment variables and system privileges.

### Available Commands:
* `ls` : Lists files in the sandbox workspace.
* `cat <file>` : Prints file contents into the console.
* `edit <file>` : Opens file inside the terminal-aligned code editor panel dynamically.
* `touch <file>` : Instantly creates a blank file.
* `mkdir <folder>` : Creates a new directory.
* `node <file.js>` : Executes node script (e.g. `node yuihime-query.cjs`).
* `yuihime` : Displays Yuihime Core Kernel State, DB paths, and environment settings.
* `clear` : Clears the active terminal output.

### Accessing the Yuihime Ecosystem:
To access the core system database, you can run scripts like `node yuihime-query.cjs` or directly interact with database using standard node drivers.
