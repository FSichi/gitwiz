/**
 * Spanish UI strings. The English text is the key; anything missing here
 * falls back to English automatically.
 */
export const MESSAGES_ES: Record<string, string> = {
  // ---- shared -------------------------------------------------------------
  'This folder is not a git repository.': 'Esta carpeta no es un repositorio git.',
  'Move into your project folder, or run "gitwiz init" to set one up.':
    'Movete a la carpeta de tu proyecto, o corré "gitwiz init" para crear uno.',
  'Cancelled.': 'Cancelado.',
  'Nothing changed.': 'No se cambió nada.',
  'Nothing selected.': 'No seleccionaste nada.',
  'Are you absolutely sure?': '¿Estás completamente seguro?',
  'Cancel': 'Cancelar',
  '(recommended)': '(recomendado)',
  'You have uncommitted changes.': 'Tenés cambios sin commitear.',
  'You are not on any branch (detached HEAD).': 'No estás en ninguna rama (detached HEAD).',
  'Switch to a branch first: git switch {branch}': 'Cambiá a una rama primero: git switch {branch}',
  'Valid types: {types}.': 'Tipos válidos: {types}.',
  'What do you want to do?': '¿Qué querés hacer?',
  'This command is interactive and requires a terminal.':
    'Este comando es interactivo y necesita una terminal.',
  'Run it directly in your terminal, not from a script or CI.':
    'Ejecutalo directo en tu terminal, no desde un script o CI.',
  'Working tree clean — nothing to commit.': 'Todo limpio — no hay nada para commitear.',
  'Your stashed changes could not be re-applied cleanly.':
    'Tus cambios guardados no se pudieron re-aplicar limpiamente.',
  'Resolve the conflicts, then run: git stash drop':
    'Resolvé los conflictos y después ejecutá: git stash drop',
  'Fix the conflicted files, then stage them with git add.':
    'Arreglá los archivos en conflicto y agregalos con git add.',

  // ---- cli descriptions ----------------------------------------------------
  'Friendly git workflows — wizards for branching, commits, releases, sync, and undo':
    'Flujos de git amigables — asistentes para ramas, commits, releases, sync y deshacer',
  'also echo the read-only git commands gitwiz runs':
    'mostrar también los comandos git de solo lectura que ejecuta gitwiz',
  'Set up gitwiz in this repository (branches, tag prefix)':
    'Configurar gitwiz en este repositorio (ramas, prefijo de tags)',
  'Start a new work branch (feature, bugfix, hotfix, …) the right way':
    'Crear una rama de trabajo (feature, bugfix, hotfix, …) de la forma correcta',
  'branch type (feature, bugfix, …) — runs without prompts when used with --name':
    'tipo de rama (feature, bugfix, …) — corre sin preguntas si se usa con --name',
  'branch name': 'nombre de la rama',
  'push the new branch to origin': 'pushear la rama nueva a origin',
  'Create a well-formed commit with a guided wizard':
    'Crear un commit bien formado con un asistente guiado',
  'commit type (feat, fix, …) — runs without prompts when used with -m':
    'tipo de commit (feat, fix, …) — corre sin preguntas si se usa con -m',
  'commit scope': 'scope del commit',
  'commit description': 'descripción del commit',
  'mark as a breaking change (optionally with a migration note)':
    'marcar como breaking change (opcionalmente con una nota de migración)',
  'stage all changes before committing': 'agregar todos los cambios antes de commitear',
  'allow committing directly to a protected branch':
    'permitir commitear directo a una rama protegida',
  'Where am I and what should I do next?': '¿Dónde estoy y qué hago ahora?',
  'Safely bring the latest changes into your branch':
    'Traer los últimos cambios a tu rama de forma segura',
  'Undo things safely: commits, staged files, local changes':
    'Deshacer cosas de forma segura: commits, archivos staged, cambios locales',
  'Set changes aside for later and bring them back safely':
    'Guardar cambios para después y recuperarlos de forma segura',
  'Cut and publish versions with changelog generation':
    'Cortar y publicar versiones con generación de changelog',
  'Start a release: bump the version and generate the changelog':
    'Iniciar un release: subir la versión y generar el changelog',
  'bump the major version (without prompting)': 'subir la versión major (sin preguntar)',
  'bump the minor version (without prompting)': 'subir la versión minor (sin preguntar)',
  'bump the patch version (without prompting)': 'subir la versión patch (sin preguntar)',
  'set an exact version (without prompting)': 'fijar una versión exacta (sin preguntar)',
  'Finish the open release: merge, tag, push and clean up':
    'Terminar el release abierto: merge, tag, push y limpieza',
  'skip the confirmation prompt (for automation)':
    'saltear la confirmación (para automatización)',

  // ---- commit ---------------------------------------------------------------
  'The commit was rejected (a git hook may have failed).':
    'El commit fue rechazado (puede haber fallado un hook de git).',
  'Fix the reported issue and run "gitwiz commit" again.':
    'Arreglá el problema reportado y volvé a correr "gitwiz commit".',
  'Commit created.': 'Commit creado.',
  '"{branch}" is a protected branch — commits should arrive via work branches.':
    '"{branch}" es una rama protegida — los commits deberían llegar por ramas de trabajo.',
  'Create a branch first (gitwiz branch), or pass --allow-protected to override.':
    'Creá una rama primero (gitwiz branch), o pasá --allow-protected para forzarlo.',
  'You are about to commit directly to {branch}, a protected branch.':
    'Estás por commitear directo a {branch}, una rama protegida.',
  'Commit to {branch} anyway?': '¿Commitear a {branch} igual?',
  'Cancelled. Run "gitwiz branch" to start a work branch instead.':
    'Cancelado. Corré "gitwiz branch" para crear una rama de trabajo.',
  'Unknown commit type "{type}".': 'Tipo de commit desconocido: "{type}".',
  'Nothing is staged.': 'No hay nada staged.',
  'Stage the files first, or pass --all to stage everything.':
    'Agregá los archivos primero, o pasá --all para agregar todo.',
  'The commit subject is {n} characters (recommended ≤ 72).':
    'El título del commit tiene {n} caracteres (recomendado ≤ 72).',
  'No files are staged yet.': 'Todavía no hay archivos staged.',
  'No files are staged yet, but {n} file(s) have changes.':
    'Todavía no stagedeaste nada, pero veo {n} archivo(s) con cambios.',
  'How would you like to proceed?': '¿Cómo querés proceder?',
  'Stage all changes and commit': 'Agregar todos los cambios y commitear',
  'Stage all': 'Agregar todos',
  'Pick specific files to stage': 'Elegir archivos específicos para agregar',
  'Pick files': 'Elegir archivos',
  'Pick the files to include in this commit:': 'Elegí los archivos para incluir en este commit:',
  'No files selected — nothing to commit.': 'No elegiste archivos — nada para commitear.',
  'Files in this commit:': 'Archivos en este commit:',
  'Type of change:': 'Tipo de cambio:',
  'Scope': 'Scope',
  '(optional — the area affected, e.g. api, ui, auth)':
    '(opcional — el área afectada, ej. api, ui, auth)',
  'Short description (imperative: "add", "fix", not "added"):':
    'Descripción corta (en imperativo: "agregar", "arreglar"):',
  'Description cannot be empty.': 'La descripción no puede estar vacía.',
  'Does this break existing behavior (breaking change)?':
    '¿Rompe comportamiento existente (breaking change)?',
  'Describe what breaks and how to migrate:': 'Describí qué se rompe y cómo migrar:',
  'The first line is {n} characters — try to keep it under 72.':
    'La primera línea tiene {n} caracteres — tratá de mantenerla bajo 72.',
  'Create this commit?': '¿Crear este commit?',
  'Commit cancelled. Your files are still staged.':
    'Commit cancelado. Tus archivos siguen staged.',

  // commit type descriptions (defaults)
  'A new feature': 'Una funcionalidad nueva',
  'A bug fix': 'Un arreglo de bug',
  'Documentation only': 'Solo documentación',
  'Formatting, whitespace, no code change': 'Formato, espacios, sin cambios de código',
  'Neither fixes a bug nor adds a feature': 'No arregla un bug ni agrega funcionalidad',
  'Performance improvement': 'Mejora de performance',
  'Adding or fixing tests': 'Agregar o arreglar tests',
  'Maintenance, tooling': 'Mantenimiento, tooling',
  'CI configuration': 'Configuración de CI',
  'Build system or dependencies': 'Sistema de build o dependencias',

  // ---- branch ---------------------------------------------------------------
  'Unknown branch type "{type}".': 'Tipo de rama desconocido: "{type}".',
  'Using auto-detected branches (main: {main}, work base: {develop}). Run "gitwiz init" to pin them.':
    'Usando ramas auto-detectadas (main: {main}, base de trabajo: {develop}). Corré "gitwiz init" para fijarlas.',
  'What kind of work are you starting?': '¿Qué tipo de trabajo vas a empezar?',
  'Name for the new branch': 'Nombre para la rama nueva',
  '(will become {prefix}<name>)': '(va a quedar {prefix}<nombre>)',
  'Branch "{branch}" already exists.': 'La rama "{branch}" ya existe.',
  'Switch to it with: git switch {branch}': 'Cambiá a ella con: git switch {branch}',
  '"{branch}" is not a valid git branch name.': '"{branch}" no es un nombre de rama válido.',
  'Commit or stash them first — create the branch before you start editing.':
    'Commitealos o guardalos primero — creá la rama antes de empezar a editar.',
  'You have uncommitted changes. What should we do with them?':
    'Tenés cambios sin commitear. ¿Qué hacemos con ellos?',
  'Stash them and bring them to the new branch': 'Guardarlos y llevarlos a la rama nueva',
  'Carry them along without updating {base}': 'Llevarlos sin actualizar {base}',
  '(branch starts from your current state)': '(la rama arranca desde tu estado actual)',
  'Cancel — let me commit or clean up first': 'Cancelar — dejame commitear o limpiar primero',
  'Cancelled. Tip: "gitwiz commit" can help you commit what you have.':
    'Cancelado. Tip: "gitwiz commit" te ayuda a commitear lo que tenés.',
  'Base branch "{base}" does not exist locally or on origin.':
    'La rama base "{base}" no existe ni local ni en origin.',
  'Check your gitwiz config or run "gitwiz init".':
    'Revisá tu config de gitwiz o corré "gitwiz init".',
  'Could not fast-forward {base} (offline, or the branch has diverged).':
    'No se pudo hacer fast-forward de {base} (sin conexión, o la rama divergió).',
  'Create {branch} from your local {base} anyway?': '¿Crear {branch} desde tu {base} local igual?',
  'Push {branch} to origin and set it as upstream?':
    '¿Pushear {branch} a origin y dejarla como upstream?',
  'You are now on {branch}. Happy hacking!': 'Ya estás en {branch}. ¡A programar!',
  'Next: make your changes, then run "gitwiz commit".':
    'Siguiente: hacé tus cambios y después corré "gitwiz commit".',

  // branch type descriptions (defaults)
  'New functionality': 'Funcionalidad nueva',
  'Non-urgent bug fix': 'Arreglo de bug no urgente',
  'Urgent fix for production': 'Arreglo urgente para producción',
  'Code improvement, no behavior change': 'Mejora de código, sin cambio de comportamiento',
  'Maintenance task': 'Tarea de mantenimiento',
  'Documentation changes': 'Cambios de documentación',

  // ---- release start ----------------------------------------------------------
  'A release is already in progress: {branch}': 'Ya hay un release en progreso: {branch}',
  'Finish it with "gitwiz release finish" (or delete the branch) before starting a new one.':
    'Terminalo con "gitwiz release finish" (o borrá la rama) antes de empezar otro.',
  'A release branch already exists on origin: {branch}':
    'Ya existe una rama de release en origin: {branch}',
  'Someone may have a release in progress. Finish or delete it first.':
    'Puede que alguien tenga un release en progreso. Terminalo o borralo primero.',
  'Commit them ("gitwiz commit") or stash them before starting a release.':
    'Commitealos ("gitwiz commit") o guardalos antes de iniciar un release.',
  '"{version}" is not a valid semver version.': '"{version}" no es una versión semver válida.',
  'Version {version} must be greater than the current {current}.':
    'La versión {version} debe ser mayor que la actual {current}.',
  'the beginning': 'el inicio',
  'Since {ref}: {summary} → suggested bump: {bump}':
    'Desde {ref}: {summary} → bump sugerido: {bump}',
  '{n} other': '{n} otros',
  'bug fixes only': 'solo arreglos de bugs',
  'new features': 'funcionalidades nuevas',
  'breaking changes': 'cambios incompatibles',
  'Current version is {version}. What kind of release is this?':
    'La versión actual es {version}. ¿Qué tipo de release es?',
  '(suggested)': '(sugerido)',
  'type a version yourself': 'escribir una versión a mano',
  'New version:': 'Nueva versión:',
  'Not a valid semver version (e.g. 1.4.0).': 'No es una versión semver válida (ej. 1.4.0).',
  'Must be greater than the current version ({current}).':
    'Debe ser mayor que la versión actual ({current}).',
  'Release branch {branch} created — version bumped to {version}.':
    'Rama de release {branch} creada — versión subida a {version}.',
  'Next steps:': 'Próximos pasos:',
  '1. Review {file} (commit any edits to this branch).':
    '1. Revisá {file} (commiteá cualquier ajuste a esta rama).',
  '2. When everything looks good, run {cmd}.': '2. Cuando esté todo bien, corré {cmd}.',

  // ---- release finish -----------------------------------------------------------
  'The merge into {target} stopped because of conflicts:':
    'El merge a {target} se detuvo por conflictos:',
  '1. Fix the conflicted files ("gitwiz status" lists them).':
    '1. Arreglá los archivos en conflicto ("gitwiz status" los lista).',
  '2. Stage them:    git add <file>': '2. Agregalos:     git add <archivo>',
  '3. Continue with: git merge --continue': '3. Continuá con:  git merge --continue',
  'Or undo with:     git merge --abort  (then run "gitwiz release finish" again)':
    'O deshacé con:    git merge --abort  (y volvé a correr "gitwiz release finish")',
  'Tag "{tag}" already exists.': 'El tag "{tag}" ya existe.',
  'This version seems to be released already. Delete the tag or pick another version.':
    'Esta versión parece estar publicada. Borrá el tag o elegí otra versión.',
  'This version seems to be released already.': 'Esta versión parece estar publicada.',
  'Release branch {branch} exists on origin but not locally. Check it out?':
    'La rama {branch} existe en origin pero no localmente. ¿Traerla?',
  'No release branch found.': 'No se encontró ninguna rama de release.',
  'Start one with "gitwiz release start".': 'Iniciá uno con "gitwiz release start".',
  'Multiple release branches are open: {branches}.':
    'Hay varias ramas de release abiertas: {branches}.',
  'Finish them one at a time without --yes, or delete the extra branch.':
    'Terminalas de a una sin --yes, o borrá la rama de más.',
  'Which release do you want to finish?': '¿Qué release querés terminar?',
  'There are uncommitted changes on the release branch:':
    'Hay cambios sin commitear en la rama de release:',
  'Commit them to {branch} as part of the release?':
    '¿Commitearlos a {branch} como parte del release?',
  'Cancelled — clean up the release branch first.':
    'Cancelado — limpiá la rama de release primero.',
  'This will:': 'Esto va a:',
  '1. Merge {branch} into {target} (--no-ff)': '1. Mergear {branch} a {target} (--no-ff)',
  '2. Create tag {tag}': '2. Crear el tag {tag}',
  '3. Push {branch} and the tag to origin': '3. Pushear {branch} y el tag a origin',
  '4. Also merge into {branch} and push it': '4. Mergear también a {branch} y pushearla',
  'Delete the {branch} branch': 'Borrar la rama {branch}',
  'Finish release {version}?': '¿Terminar el release {version}?',
  'Release {tag} is done! 🎉': '¡Release {tag} terminado! 🎉',
  '{branch} was NOT modified — deploy/merge to production is a separate, manual step.':
    '{branch} NO fue modificada — el deploy/merge a producción es un paso aparte, manual.',

  // ---- sync ------------------------------------------------------------------
  'The {operation} stopped because of conflicts. This is normal — git needs your help:':
    'El {operation} se detuvo por conflictos. Es normal — git necesita tu ayuda:',
  '1. Open the conflicted files (run "gitwiz status" to list them) and fix the marked sections.':
    '1. Abrí los archivos en conflicto ("gitwiz status" los lista) y arreglá las secciones marcadas.',
  '2. Stage the fixed files:  git add <file>': '2. Agregá los arreglados:  git add <archivo>',
  '3. Continue with:          git {operation} --continue':
    '3. Continuá con:           git {operation} --continue',
  'Or undo everything with:   git {operation} --abort':
    'O deshacé todo con:        git {operation} --abort',
  'Note: your local changes are stashed — recover them later with: git stash pop':
    'Nota: tus cambios locales están en el stash — recuperalos después con: git stash pop',
  'Your branch {branch} is {ahead} and {behind} {base}.':
    'Tu rama {branch} está {ahead} y {behind} de {base}.',
  '{n} ahead': '{n} adelante',
  '{n} behind': '{n} atrás',
  '0 behind': '0 atrás',
  'Already up to date with {base}.': 'Ya estás al día con {base}.',
  'Merge {base} into my branch': 'Mergear {base} a mi rama',
  '(safe, recommended)': '(seguro, recomendado)',
  'Rebase my branch onto {base}': 'Rebasear mi rama sobre {base}',
  '(linear history — rewrites your commits)': '(historia lineal — reescribe tus commits)',
  'Just update my local copy of {base}': 'Solo actualizar mi copia local de {base}',
  '({n} behind origin)': '({n} atrás de origin)',
  'Pull my own branch from {upstream}': 'Traer mi propia rama desde {upstream}',
  '({n} behind)': '({n} atrás)',
  'Everything is already in sync. Nothing to do.': 'Ya está todo sincronizado. Nada que hacer.',
  'Do nothing': 'No hacer nada',
  'nothing': 'nada',
  'How do you want to sync?': '¿Cómo querés sincronizar?',
  'You have uncommitted changes. Stash them safely and re-apply after syncing?':
    'Tenés cambios sin commitear. ¿Guardarlos y re-aplicarlos después de sincronizar?',
  'Cancelled — commit or stash your changes first.':
    'Cancelado — commiteá o guardá tus cambios primero.',
  'Merged {base} into {branch}.': '{base} mergeado a {branch}.',
  'This branch is already pushed — rebasing rewrites its history.':
    'Esta rama ya está pusheada — rebasear reescribe su historia.',
  'You will need "git push --force-with-lease" afterwards, and teammates on this branch will be disrupted.':
    'Después vas a necesitar "git push --force-with-lease", y va a afectar a quienes trabajen en esta rama.',
  'Rebase anyway?': '¿Rebasear igual?',
  'Rebased {branch} onto {base}.': '{branch} rebaseada sobre {base}.',
  'Push with: git push --force-with-lease': 'Pusheá con: git push --force-with-lease',
  'Could not fast-forward {base} — it has diverged from origin.':
    'No se pudo hacer fast-forward de {base} — divergió de origin.',
  'Local {base} is now up to date.': 'Tu {base} local quedó al día.',
  'Could not fast-forward — your branch and its remote have diverged.':
    'No se pudo hacer fast-forward — tu rama y su remoto divergieron.',
  'Run "gitwiz sync" again and choose merge or rebase against the base, or ask a teammate for help.':
    'Corré "gitwiz sync" de nuevo y elegí merge o rebase contra la base, o pedí ayuda a un compañero.',
  'Pulled latest {branch}.': 'Traído lo último de {branch}.',

  // ---- undo -------------------------------------------------------------------
  'The last commit is already pushed — rewriting it will conflict with the remote.':
    'El último commit ya está pusheado — reescribirlo va a chocar con el remoto.',
  'How do you want to handle this?': '¿Cómo lo querés manejar?',
  'Create a revert commit instead': 'Crear un commit de revert en su lugar',
  '(safe — adds a new commit that undoes it)': '(seguro — agrega un commit nuevo que lo deshace)',
  'Rewrite it anyway': 'Reescribirlo igual',
  '(you will need git push --force-with-lease)': '(vas a necesitar git push --force-with-lease)',
  'Revert commit created.': 'Commit de revert creado.',
  'Abort the {operation} in progress': 'Abortar el {operation} en progreso',
  '(back to how things were before it)': '(volver a como estaba antes)',
  'Undo the last commit, keep its changes': 'Deshacer el último commit, conservar sus cambios',
  'Undo the last commit AND throw away its changes':
    'Deshacer el último commit Y descartar sus cambios',
  'Change the last commit message': 'Cambiar el mensaje del último commit',
  'Unstage files': 'Sacar archivos del stage',
  '({n} staged)': '({n} staged)',
  'Throw away local changes in files': 'Descartar cambios locales en archivos',
  '({n} files)': '({n} archivos)',
  'Nothing to undo — no commits, no changes, all clean.':
    'Nada para deshacer — sin commits, sin cambios, todo limpio.',
  'Cancel — nothing, I was just looking': 'Cancelar — nada, solo estaba mirando',
  'What do you want to undo?': '¿Qué querés deshacer?',
  'The {operation} was aborted. Everything is back to how it was.':
    'El {operation} fue abortado. Todo volvió a como estaba.',
  'Last commit undone. Its changes are still staged — edit and recommit when ready.':
    'Último commit deshecho. Sus cambios siguen staged — editá y volvé a commitear cuando quieras.',
  'This permanently discards the changes from: {commit}':
    'Esto descarta permanentemente los cambios de: {commit}',
  'Last commit and its changes are gone.': 'El último commit y sus cambios ya no están.',
  '(If you regret it: "git reflog" can still rescue it for a while.)':
    '(Si te arrepentís: "git reflog" todavía puede rescatarlo por un tiempo.)',
  'New commit message:': 'Nuevo mensaje del commit:',
  'Message cannot be empty.': 'El mensaje no puede estar vacío.',
  'Commit message updated.': 'Mensaje del commit actualizado.',
  'Which files do you want to unstage?': '¿Qué archivos querés sacar del stage?',
  'Files unstaged. Their changes are still in your working tree.':
    'Archivos fuera del stage. Sus cambios siguen en tu working tree.',
  '(modified)': '(modificado)',
  '(new file)': '(archivo nuevo)',
  'Which files should lose their local changes?':
    '¿Qué archivos deberían perder sus cambios locales?',
  'These changes cannot be recovered once discarded.':
    'Estos cambios no se pueden recuperar una vez descartados.',
  'Discard changes in {n} file(s)?': '¿Descartar cambios en {n} archivo(s)?',
  'Local changes discarded.': 'Cambios locales descartados.',

  // ---- status ----------------------------------------------------------------
  'A {operation} is in progress — resolve conflicts and continue (git {operation} --continue), or abort it with {cmd}.':
    'Hay un {operation} en progreso — resolvé los conflictos y continuá (git {operation} --continue), o abortalo con {cmd}.',
  'You have staged changes — run {cmd} to commit them.':
    'Tenés cambios staged — corré {cmd} para commitearlos.',
  'You are editing directly on {branch} — run {cmd} to start a work branch first.':
    'Estás editando directo en {branch} — corré {cmd} para crear una rama de trabajo primero.',
  'Run {cmd} — it will help you pick files and write the message.':
    'Corré {cmd} — te ayuda a elegir archivos y escribir el mensaje.',
  'Your branch is behind its remote — run {cmd} to update.':
    'Tu rama está atrás de su remoto — corré {cmd} para actualizar.',
  'You have {n} unpushed commit(s) — run {cmd} to share them.':
    'Tenés {n} commit(s) sin pushear — corré {cmd} para compartirlos.',
  'Release branch {branch} is open — run {cmd} when it is ready.':
    'La rama de release {branch} está abierta — corré {cmd} cuando esté lista.',
  'All clean and in sync. Start something new with {cmd}.':
    'Todo limpio y sincronizado. Empezá algo nuevo con {cmd}.',
  'Get back to safety with: git switch {branch}': 'Volvé a terreno seguro con: git switch {branch}',
  'On branch {branch}': 'En la rama {branch}',
  '(based on {base})': '(basada en {base})',
  '↑ {n} ahead': '↑ {n} adelante',
  '↓ {n} behind': '↓ {n} atrás',
  'in sync': 'sincronizada',
  'of {upstream}': 'de {upstream}',
  'Not pushed to any remote yet.': 'Todavía no está pusheada a ningún remoto.',
  'A {operation} is in progress.': 'Hay un {operation} en progreso.',
  'Conflicted (fix these first):': 'En conflicto (arreglá esto primero):',
  'Staged (ready to commit):': 'Staged (listos para commitear):',
  'Modified (not staged):': 'Modificados (sin stagear):',
  'Untracked (new files):': 'Sin trackear (archivos nuevos):',
  'Working tree clean.': 'Todo limpio.',
  'Suggested next steps:': 'Próximos pasos sugeridos:',

  // ---- stash -----------------------------------------------------------------
  'Nothing to stash and no stashes saved. All clean.':
    'Nada para guardar y ningún stash guardado. Todo limpio.',
  'Save my current changes for later': 'Guardar mis cambios actuales para después',
  '(clears your working tree)': '(deja tu working tree limpio)',
  'Restore a saved stash': 'Restaurar un stash guardado',
  'Show what a stash contains': 'Ver qué contiene un stash',
  'Delete a stash': 'Borrar un stash',
  '(cannot be recovered)': '(no se puede recuperar)',
  'Describe these changes (so future-you recognizes them):':
    'Describí estos cambios (para que tu yo del futuro los reconozca):',
  'A short description helps — it cannot be empty.':
    'Una descripción corta ayuda — no puede estar vacía.',
  'Changes stashed. Bring them back later with "gitwiz stash".':
    'Cambios guardados. Recuperalos después con "gitwiz stash".',
  'Which stash do you want to restore?': '¿Qué stash querés restaurar?',
  'How do you want to restore it?': '¿Cómo lo querés restaurar?',
  'Restore and remove it from the list': 'Restaurarlo y sacarlo de la lista',
  'Restore but keep a copy in the list': 'Restaurarlo pero dejar una copia en la lista',
  'The stash could not be applied cleanly (conflicts with your current files).':
    'El stash no se pudo aplicar limpiamente (conflictos con tus archivos actuales).',
  'The stash entry is still saved — nothing was lost.':
    'El stash sigue guardado — no se perdió nada.',
  'Stash restored.': 'Stash restaurado.',
  'Which stash do you want to inspect?': '¿Qué stash querés inspeccionar?',
  'Which stash do you want to delete?': '¿Qué stash querés borrar?',
  'This permanently deletes: {stash}': 'Esto borra permanentemente: {stash}',
  'Stash deleted.': 'Stash borrado.',

  // ---- menu ------------------------------------------------------------------
  '— where am I and what to do next': '— dónde estoy y qué hacer ahora',
  '— create a guided commit': '— crear un commit guiado',
  '— start a new work branch': '— crear una rama de trabajo',
  '— update my branch safely': '— actualizar mi rama de forma segura',
  '— undo something safely': '— deshacer algo de forma segura',
  '— set changes aside for later': '— guardar cambios para después',
  '— bump version + changelog': '— subir versión + changelog',
  '— merge, tag, publish': '— merge, tag, publicar',
  '— set up gitwiz here': '— configurar gitwiz acá',
  '— update to latest version': '— actualizar a la última versión',
  'exit': 'salir',
  'Bye!': '¡Chau!',

  // ---- init ------------------------------------------------------------------
  'This folder is not a git repository yet. Initialize one here?':
    'Esta carpeta todavía no es un repositorio git. ¿Inicializar uno acá?',
  'Production branch': 'Rama de producción',
  '(your stable, deployed code)': '(tu código estable, deployado)',
  'Work base branch': 'Rama base de trabajo',
  '(where new branches start; same as production = trunk-based)':
    '(de donde salen las ramas nuevas; igual a producción = trunk-based)',
  'Release tag prefix': 'Prefijo de tags de release',
  '("v" tags releases as v1.2.3; leave empty for 1.2.3)':
    '("v" taguea releases como v1.2.3; vacío para 1.2.3)',
  'Branch {branch} exists on origin — it will be used when needed.':
    'La rama {branch} existe en origin — se va a usar cuando haga falta.',
  'No commits yet — make your first commit, then create {branch}.':
    'Todavía no hay commits — hacé tu primer commit y después creá {branch}.',
  'Branch "{branch}" does not exist. Create it from {main}?':
    'La rama "{branch}" no existe. ¿Crearla desde {main}?',
  'Push {branch} to origin?': '¿Pushear {branch} a origin?',
  'Where should the gitwiz config be saved?': '¿Dónde guardamos la config de gitwiz?',
  '(recommended — its own file)': '(recomendado — su propio archivo)',
  'package.json ("gitwiz" key)': 'package.json (key "gitwiz")',
  'Saved {file}': 'Guardado {file}',
  'Saved "gitwiz" key in package.json': 'Guardada la key "gitwiz" en package.json',
  'Add an AGENTS.md so AI coding agents follow this git workflow?':
    '¿Agregar un AGENTS.md para que los agentes de IA sigan este flujo de git?',
  'Created AGENTS.md': 'AGENTS.md creado',
  'Updated AGENTS.md': 'AGENTS.md actualizado',
  'Setup complete:': 'Configuración completa:',
  'Production branch:': 'Rama de producción:',
  'Work base branch:': 'Rama base de trabajo:',
  'Release tags:': 'Tags de release:',
  'Next: run "gitwiz branch" to start working, or "gitwiz status" anytime you feel lost.':
    'Siguiente: corré "gitwiz branch" para empezar a trabajar, o "gitwiz status" cuando te sientas perdido.',

  // ---- update ----------------------------------------------------------------
  'Update gitwiz to the latest version': 'Actualizar gitwiz a la última versión',
  'use npm as package manager': 'usar npm como package manager',
  'use yarn as package manager': 'usar yarn como package manager',
  'use pnpm as package manager': 'usar pnpm como package manager',
  'use bun as package manager': 'usar bun como package manager',
  'Detected package manager: {pm}': 'Package manager detectado: {pm}',
  'Checking for updates...': 'Buscando actualizaciones...',
  'Updating @fsichi/gitwiz via {pm}...': 'Actualizando @fsichi/gitwiz con {pm}...',
  '@fsichi/gitwiz updated successfully! 🎉': '¡@fsichi/gitwiz se actualizó correctamente! 🎉',
  'Run "gitwiz --version" to verify.': 'Corré "gitwiz --version" para verificar.',
  'Update failed.': 'La actualización falló.',
  'Try running the command manually: {cmd}': 'Intentá correr el comando manualmente: {cmd}',
};
