import { expect, test } from 'claude-code/testing'
import { shellRefusal } from '../hooks/shell-refusal'

const who = 'Vlad'
const refused = (line: string, agent = false) => shellRefusal(line, { who, agent }) !== undefined

const AZ_REFUSED = [
  'az group delete -n x --yes',
  'az group create -n x -l uksouth',
  'az keyvault secret set --vault-name v -n s --value x',
  'az webapp deployment slot swap -g g -n n --slot staging',
  'az repos pr create --title x',
  'az repos pr create --draft true --draft false --title x',
  'az repos pr create --draft=false --title x',
  'cd /d/Github/Repo && az group delete -n x',
  'echo hi | az group delete -n x',
  'bash -c "az group delete -n x"',
  `bash -c "pwsh -c 'az group delete -n x'"`,
  'cmd /c az group delete -n x',
  '/usr/bin/az group delete -n x',
  'az.cmd group delete -n x',
  'AZ GROUP DELETE -n x',
  'az --debug repos pr create --title x',
  'az --debug --verbose repos pr create --title x',
  'az --only-show-errors group delete -n x',
  'az -o table group delete -n x',
  'az --debug repos pr create --draft false --title x',
]

const AZ_ALLOWED = [
  'az version --query "fix the update path"',
  'az group list -o table',
  'az account set --subscription x',
  'az config set --local',
  'az --debug account set --subscription x',
  'az repos pr create --draft true --title "update the start path"',
  'az repos pr create --title x --draft=true',
  'az --debug repos pr create --draft true --title x',
  'az --debug',
  'az',
  'echo az group delete',
  'git commit -m "az group delete"',
  `bash -c 'echo "az group delete"'`,
]

const AGENT_REFUSED = [
  'terraform plan',
  'terraform -chdir=a apply -auto-approve',
  'terraform state rm x',
  'terraform init',
  'terraform -chdir=a init -input=false',
  'bash -c "terraform import a b"',
  'npm publish',
  './mvnw -B deploy',
  'mvn release:prepare',
  'dotnet nuget push x.nupkg',
  'mvn deploy:deploy-file -Dfile=x.jar',
  'mvn org.apache.maven.plugins:maven-deploy-plugin:3.1.1:deploy',
  'nuget.exe push x.nupkg',
]

const AGENT_ALLOWED = [
  'terraform fmt -check -recursive',
  'terraform -chdir=a init -backend=false -input=false -lockfile=readonly && terraform -chdir=a validate',
  'terraform version',
  'npm ci && npx ng test --watch=false',
  'mvn -B test',
  'dotnet test --blame-hang-timeout 5m',
]

test('az commands that change Azure resources are refused, with or without a pipeline agent', () => {
  for (const line of AZ_REFUSED) {
    expect([line, refused(line, false), refused(line, true)]).toEqual([line, true, true])
  }
})

test('read-only az, local CLI settings, draft PRs and text that only mentions az pass', () => {
  for (const line of AZ_ALLOWED) {
    expect([line, refused(line, false), refused(line, true)]).toEqual([line, false, false])
  }
})

test('terraform beyond fmt and validate, and publishing, are refused to pipeline agents only', () => {
  for (const line of AGENT_REFUSED) {
    expect([line, refused(line, true), refused(line, false)]).toEqual([line, true, false])
  }
  for (const line of AGENT_ALLOWED) {
    expect([line, refused(line, true)]).toEqual([line, false])
  }
})

test('the az refusal names the person who runs it', () => {
  expect(shellRefusal('az --debug group delete -n x', { who: 'Ana', agent: false })).toBe('agent-pipeline: `az group delete` changes Azure resources; ask Ana to run it.')
})
