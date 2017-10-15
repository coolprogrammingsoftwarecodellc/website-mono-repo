/**
 * Based off of https://gist.github.com/domenic/ec8b0fc8ab45f39403dd
 */

const path = require('path');
const { readdirSync, existsSync } = require('fs');
const { execSync } = require('child_process');
const tmp = require('tmp');
const emoji = require('emoji-random');
const parseGitUrl = require('git-url-parse');

if (!process.argv[2]) {
  console.log('Usage: deploy.js {mono-repo-root}');
  process.exit(0);
}

const monoRepoDir = path.resolve(process.argv[2]);
const sitesDir = path.join(monoRepoDir, 'sites');

const sites = readdirSync(sitesDir);

const exec = (cmd, options = {}) => (
  execSync(cmd, Object.assign(
    { stdio: 'inherit', env: process.env },
    options
  ))
)

const execIn = cwd => (command, options = {}) => (
  exec(command, Object.assign(options, { cwd }))
);

const monoRepoExec = execIn(monoRepoDir);

console.log(`\nStarting deploy script for [ ${sites.join(', ')} ]\n`)

exec('git config --global user.name "WWWTF Deploy Bot"');
exec('git config --global user.email "deploy@wwwtf.berlin"');

sites.forEach(site => {
  const siteDir = path.join(sitesDir, site);
  const siteExec = execIn(siteDir);
  const packagePath = path.join(siteDir, 'package.json');
  
  if (!existsSync(packagePath)) {
    return console.log(`\nNo package.json for ${site}. Skipping.\n`);
  }
  
  const packageJson = require(packagePath);
  const { deploy, repository, scripts } = packageJson;

  if (!deploy || !repository || !repository.url || !scripts.build) {
    return console.log(`\Bad deploy config for ${site}. Skipping.\n`)
  }

  const { buildDir, ignoreDiff } = deploy;
  const gitUrlObj = parseGitUrl(repository.url);
  const sshUrl = gitUrlObj.toString('ssh');
  const httpsUrl = gitUrlObj.toString('https');

  console.log(`\nInstalling and building ${site}\n`);

  try {
    siteExec('npm install');
    siteExec('npm run build'); 
  } catch (err) {
    return console.log(`Error installing or building ${site}. Skipping.`);
  }

  const tmpDir = tmp.dirSync().name;
  const deployCloneExec = execIn(tmpDir);

  try {
    console.log(`\nCloning ${site} deployment repo from ${httpsUrl}\n`);
    // We need to clone via HTTPS since we don't know what the SSH key is yet
    exec(`git clone ${httpsUrl} ${tmpDir}`);
    
    deployCloneExec(`cp -Rf ${path.join(siteDir, buildDir)}/* .`);    
  } catch (err) {
    return console.log(`Problem cloning ${site}. Skipping.`);
  }

  // Mark intent to add files so that git diff also works for
  // untracked files
  deployCloneExec('git add -N .');

  try {
    const ignores = ignorePathspec(ignoreDiff);
    deployCloneExec(`git diff --quiet -- . ${ignores}`);
    return console.log(`\nNo changes to ${site}. Skipping.\n`);
  } catch (err) {
    if (commitAndPush()) {
      return console.log(
        `\nError pushing to ${site} deployment repo. Skipping.\n`
      );
    }
  }

  function commitAndPush () {
    try {
      const deploySHA = monoRepoExec('git rev-parse --verify HEAD');
      
      deployCloneExec('git add -A .');
      deployCloneExec(`git commit -m 'Deploy! ${emoji.random()} ${deploySHA}'`);
      
      console.log(`\nPushing changes to ${site} deployment repo\n`);

      deployCloneExec(`openssl aes-256-cbc -K $${deploy.key} -iv $${deploy.iv} -in id_rsa.enc -out id_rsa -d`);
      deployCloneExec('chmod 600 id_rsa');
      deployCloneExec(
        `GIT_SSH_COMMAND="ssh -i id_rsa -F /dev/null" git push ${sshUrl} master`
      );
    } catch (err) {
      return err;
    }
  }

  exec(`rm -Rf ${tmpDir}`);
});

function ignorePathspec (ignores) {
  return !ignores
    ? ''
    : ignores.split(',').reduce((acc, path) => (
      `${acc}':(glob,exclude)${path}' `
    ), '');
}
