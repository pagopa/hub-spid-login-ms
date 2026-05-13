locals {
  prefix          = "io"
  env_short       = "p"
  location        = "italynorth"
  domain          = "plt"
  instance_number = "04"

  adgroups = {
    admins_name    = "io-p-adgroup-platform-admins"
    devs_name      = "io-p-adgroup-platform-developers"
    externals_name = "io-p-adgroup-platform-externals"
  }

  runner = {
    cae_name                = "${local.prefix}-${local.env_short}-itn-github-runner-cae-01"
    cae_resource_group_name = "${local.prefix}-${local.env_short}-itn-github-runner-rg-01"
    secret = {
      kv_name                = "${local.prefix}-${local.env_short}-kv-common"
      kv_resource_group_name = "${local.prefix}-${local.env_short}-rg-common"
    }
  }

  dns_zones = {
    resource_group_name = "${local.prefix}-${local.env_short}-rg-common"
  }

  tf_storage_account = {
    name                = "iopitntfst001"
    resource_group_name = "terraform-state-rg"
  }

  repository = {
    name = "hub-spid-login-ms"
  }

  key_vault = {
    name                = "io-p-itn-common-kv-01"
    resource_group_name = "io-p-itn-common-rg-01"
  }

  keyvault_common_ids = [
    data.azurerm_key_vault.common.id
  ]

  tags = {
    CreatedBy      = "Terraform"
    Environment    = "Prod"
    BusinessUnit   = "App IO"
    ManagementTeam = "IO Platform"
    CostCenter     = "TS000 - Tecnologia e Servizi"
    Source         = "https://github.com/pagopa/hub-spid-login-ms/blob/main/infra/bootstrapper/prod"
  }
}