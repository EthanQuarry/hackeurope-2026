### Install AWS CLI

`brew install awscli`

### Install Claude code

`curl -fsSL https://claude.ai/install.sh | bash`

### Configure AWS

`aws configure`

Enter in the Access Key & Secret key

### Select bedrock for ClaudeCode

`export CLAUDE_CODE_USE_BEDROCK=1`

### Run command

`AWS_PROFILE=default claude --dangerously-skip-permissions`

