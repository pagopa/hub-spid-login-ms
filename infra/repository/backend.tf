terraform {
  backend "azurerm" {
    resource_group_name  = "terraform-state-rg"
    storage_account_name = "iopitntfst001"
    container_name       = "terraform-state"
    key                  = "hub-spid-login-ms.repository.tfstate"
    use_azuread_auth     = true
  }
}