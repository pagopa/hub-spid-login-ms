module "repo" {
  source  = "pagopa-dx/github-environment-bootstrap/github"
  version = "~> 1.3"

  repository = {
    name                = "hub-spid-login-ms"
    description         = "Microservice for SPID login"
    topics              = ["spid", "cie", "docker"]
    default_branch_name = "master"
    jira_boards_ids     = ["IOPLT", "IOPID"]
    reviewers_teams     = ["io-platform-admins", "io-auth-n-identity-backend", "engineering-team-devex"]
    app_cd_policy_tags  = ["master"]
    app_cd_policy_branches = ["master"]
    bootstrapper_cd_policy_tags = ["master"]
    bootstrapper_cd_policy_branches = ["master"]
  }
}
