Set me up with Talaria, the Sea of Grass task manager: install the desktop app and connect it to Claude Code through its MCP server. Everything comes from the latest GitHub release of TristanDesigns/talaria (https://github.com/TristanDesigns/talaria/releases/latest). Work through these steps in order, tell me briefly what you're doing at each one, and stop and ask me if anything fails.

1. Check my system: OS (Linux or macOS), CPU architecture, Linux distro family (Debian/Ubuntu, Fedora/RHEL/openSUSE, or other), and whether Node.js 18 or newer is installed (`node --version`). Talaria is built for x86_64 Linux and for macOS. If Node is missing or too old, tell me the best way to install it for my system and wait until I've done it.

2. Find the latest release's files with `curl -fsSL https://api.github.com/repos/TristanDesigns/talaria/releases/latest` and pick the right installer:
   - Debian/Ubuntu → the `.deb`. Download it to a temp folder, then give me the exact `sudo apt install ./<file>.deb` command to run myself with `!` (I'll enter my password).
   - Fedora/RHEL/openSUSE → the `.rpm`, and give me the `sudo dnf install ./<file>.rpm` (or `zypper`) command to run myself.
   - Other Linux → the `.AppImage`: put it in `~/Applications/Talaria.AppImage`, `chmod +x` it, and create `~/.local/share/applications/talaria.desktop` so it shows up in my app launcher. If it complains about FUSE, tell me which package to install (usually `libfuse2`).
   - macOS → the `.dmg` for my architecture (`aarch64` for Apple Silicon, `x64` for Intel). Mount it, copy Talaria.app to /Applications, unmount, and run `xattr -dr com.apple.quarantine /Applications/Talaria.app` so it opens without the unverified-developer warning.

3. Install the Claude connector. Download `https://github.com/TristanDesigns/talaria/releases/latest/download/talaria.mcpb` (it's a zip file) and unpack it into `~/.local/share/talaria-mcp/`, replacing any older copy. Use `unzip`, or `python3 -m zipfile -e` if unzip isn't installed. Check that `~/.local/share/talaria-mcp/server/index.js` exists.

4. Register it with Claude Code for all my projects:
   `claude mcp add --scope user talaria -- node "$HOME/.local/share/talaria-mcp/server/index.js"`
   (If a `talaria` server is already registered, remove it first with `claude mcp remove talaria --scope user`.) Then confirm it with `claude mcp list`.

5. Smoke-test the server without signing in: pipe an MCP `initialize` request, an `initialized` notification and a `tools/list` request into `node ~/.local/share/talaria-mcp/server/index.js` and check the reply lists tools such as `whoami`, `my_tasks` and `create_task`.

6. Create my studio workspace: a folder `~/Sea of Grass Projects` (keep it if it already exists, and don't overwrite anything in it). Inside it, write a `CLAUDE.md` that briefs any Claude Code session started in that folder:
   - **Sea of Grass** is a studio exploring new technology in relation to art and design (website: seaofgrass.studio, publishes "studies"). **Caduceus** is our Greek-mythology study group. The people are Tristan and me (Bryce).
   - We track work in **Talaria** (the `talaria` MCP tools). Work is split into spaces ("Sea of Grass", "Caduceus") → projects → sections (To do / Doing / Done) → tasks with assignees, due dates, subtasks and comments.
   - When I ask about plans, priorities or what to work on, check Talaria first (`my_tasks`, `list_tasks`). When we agree on new work, offer to add it to Talaria rather than only noting it in chat. Refer to people, projects and sections by name; dates are YYYY-MM-DD.
   - Put each new project in its own subfolder here.
   Then ask me whether to also download the studio website's code into `~/Sea of Grass Projects/sea-of-grass` with `git clone https://github.com/Sea-Of-Grass-Ltd/sea-of-grass.git` (it's public; skip it if I say no or git isn't installed).

7. Finish by telling me:
   - that from now on I should open `~/Sea of Grass Projects` in Claude Code for studio work (in the desktop app, pick that folder when starting a session; in a terminal, `cd ~/Sea\ of\ Grass\ Projects && claude`);
   - how to open the Talaria app, and that I sign in with the email address Tristan added for me: either **Continue with Google**, or **Create account** with that email and a password (then confirm it from the email Talaria sends; if none arrives, Tristan can approve the account). If I want Google and that address isn't a Google account yet (for example a work address on another mail provider), I can make a free Google account for it, with no Gmail inbox needed: go to https://accounts.google.com/signup, and on the step that offers a Gmail address choose **"Use your existing email"** and enter my address, then confirm the code Google emails me. If Talaria says I'm not a member of any space, I'm signed in with a different address than the one Tristan added;
   - to restart Claude Code (or open a new session) so the Talaria tools load, then ask something like "What's on my plate in Talaria?". The first time, my browser opens a Talaria sign-in page where I choose **Continue with Google** or sign in with the email and password I use in the app. After that Claude acts as me, can create and update tasks, and can't delete anything.
