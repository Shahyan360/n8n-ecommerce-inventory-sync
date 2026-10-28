#!/bin/sh
set -eu
umask 077
# This temporary file exists only inside the disposable import container.
node -e 'require("fs").writeFileSync("/tmp/credential.json",JSON.stringify([{id:"commerceInternal",name:"Commerce Internal",type:"httpHeaderAuth",data:{name:"x-internal-token",value:process.env.INTERNAL_TOKEN}}]))'
trap 'rm -f /tmp/credential.json' EXIT
n8n import:credentials --input=/tmp/credential.json
n8n import:workflow --separate --input=/workflows
for file in /workflows/*.json; do
  workflow_id=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).id)' "$file")
  n8n publish:workflow --id="$workflow_id"
done
