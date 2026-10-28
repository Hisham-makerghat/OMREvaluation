# Setting up the OMR tool on Azure

One-time setup by whoever owns the Azure subscription. Everything is created in one
resource group in **Central India** so student data stays in India. Prices are
pay-as-you-go estimates (about $19 a month in total); apply for Microsoft for
Nonprofits credits first, they normally cover this.

| Piece | Azure service | Why |
|---|---|---|
| App, API and OMR engine | App Service, Linux, Python 3.11, plan **B1** | One program, HTTPS included, deploys from GitHub, no Docker |
| Sign-up and sign-in | Microsoft Entra **External ID** tenant plus App Service built-in authentication | Email + password sign-up, email verification and password reset with no login code in the app. Free for the first 50,000 monthly users |
| Database | Azure SQL Database, **Basic** tier (5 DTU, 2 GB) | Always on, no wake-up delay, has an SLA. The free tier is fine for a pilot but pauses mid-month if its 100,000 vCore-seconds run out and takes about a minute to wake |
| Scanned sheets | Blob Storage, one private container | Cheap, with an automatic delete rule for old sheets |
| Credentials | System-assigned managed identity | The app reaches SQL and Blob without any stored password |
| Deployment | GitHub Actions (`.github/workflows/ci.yml`) | Tests, builds the page, deploys on every push to `main` |

Replace the names in `UPPER_CASE` below. Run the commands in Azure Cloud Shell or with the
Azure CLI signed in (`az login`).

## 1. Resource group and web app

```bash
RG=omr-rg
LOC=centralindia
APP=omr-makerghat            # becomes https://omr-makerghat.azurewebsites.net
az group create --name $RG --location $LOC
az appservice plan create --name omr-plan --resource-group $RG --location $LOC --sku B1 --is-linux
az webapp create --name $APP --resource-group $RG --plan omr-plan --runtime "PYTHON:3.11"
az webapp update --name $APP --resource-group $RG --https-only true
az webapp config set --name $APP --resource-group $RG \
  --startup-file "gunicorn --bind 0.0.0.0:8000 --timeout 120 --workers 2 app:app"
az webapp identity assign --name $APP --resource-group $RG       # prints principalId, keep it
PRINCIPAL_ID=$(az webapp identity show --name $APP --resource-group $RG --query principalId -o tsv)
```

## 2. Sign-up and sign-in (email and password)

In the Azure portal:

1. Open the web app, then **Settings > Authentication > Add identity provider**.
2. Identity provider: **Microsoft**. Tenant type: **External configuration**.
3. **Create new** tenant: pick a name and a domain, location closest to India. Wait for it to be created.
4. **Configure** the tenant: create a user flow with the sign-in method **Email and password**
   (it is already enabled in a new tenant). Add the MakerGhat logo and colours under branding.
5. Back on the Add identity provider page: **Restrict access: Require authentication**,
   unauthenticated requests: **HTTP 302 redirect**. Save.

That is the whole login. Anyone can now sign up with an email and password on the sign-in
page, but the app only lets them in after an admin approves them on the **Users** page.
The first admin is set in step 5 below.

## 3. Database

```bash
SQLSERVER=omr-sql-makerghat
az sql server create --name $SQLSERVER --resource-group $RG --location $LOC \
  --enable-ad-only-auth --external-admin-principal-type User \
  --external-admin-name YOUR_AZURE_ADMIN_EMAIL --external-admin-sid YOUR_AZURE_ADMIN_OBJECT_ID
az sql db create --name omr --server $SQLSERVER --resource-group $RG --edition Basic --capacity 5
az sql server firewall-rule create --name AllowAzureServices --server $SQLSERVER --resource-group $RG \
  --start-ip-address 0.0.0.0 --end-ip-address 0.0.0.0
```

(`YOUR_AZURE_ADMIN_OBJECT_ID`: `az ad signed-in-user show --query id -o tsv`.)

Give the web app's identity access. Connect to the `omr` database as the admin
(portal **Query editor** works) and run, with the web app's name:

```sql
CREATE USER [omr-makerghat] FROM EXTERNAL PROVIDER;
ALTER ROLE db_datareader ADD MEMBER [omr-makerghat];
ALTER ROLE db_datawriter ADD MEMBER [omr-makerghat];
ALTER ROLE db_ddladmin  ADD MEMBER [omr-makerghat];   -- lets the app create its tables on first start
```

For the pilot you can use the free tier instead:
`az sql db create ... --edition GeneralPurpose --family Gen5 --capacity 2 --compute-model Serverless --use-free-limit true --free-limit-exhaustion-behavior BillOverUsage`.
The app already retries while a paused database wakes up.

## 4. Storage for scanned sheets

```bash
STORAGE=omrsheetsmakerghat      # lowercase letters and digits only, globally unique
az storage account create --name $STORAGE --resource-group $RG --location $LOC \
  --sku Standard_LRS --kind StorageV2 --allow-blob-public-access false --min-tls-version TLS1_2
az storage container create --name omr-sheets --account-name $STORAGE --auth-mode login
az role assignment create --assignee $PRINCIPAL_ID --role "Storage Blob Data Contributor" \
  --scope $(az storage account show --name $STORAGE --resource-group $RG --query id -o tsv)
```

Delete sheets automatically after the retention period you choose (here 365 days):

```bash
cat > lifecycle.json <<'JSON'
{"rules":[{"enabled":true,"name":"delete-old-sheets","type":"Lifecycle","definition":{
  "actions":{"baseBlob":{"delete":{"daysAfterModificationGreaterThan":365}}},
  "filters":{"blobTypes":["blockBlob"],"prefixMatch":["omr-sheets/batches/"]}}}]}
JSON
az storage account management-policy create --account-name $STORAGE --resource-group $RG --policy @lifecycle.json
```

## 5. App settings

```bash
az webapp config appsettings set --name $APP --resource-group $RG --settings \
  DATABASE_URL="mssql+pyodbc://@$SQLSERVER.database.windows.net:1433/omr?driver=ODBC+Driver+18+for+SQL+Server&Authentication=ActiveDirectoryMsi&Encrypt=yes" \
  AZURE_STORAGE_ACCOUNT_URL="https://$STORAGE.blob.core.windows.net" \
  AZURE_STORAGE_CONTAINER="omr-sheets" \
  ADMIN_EMAILS="hisham@makerghat.org" \
  SECRET_KEY="$(openssl rand -hex 32)" \
  SCM_DO_BUILD_DURING_DEPLOYMENT=true
```

`ADMIN_EMAILS` is a comma-separated list. Those addresses are admins the moment they sign
in; everyone else waits for approval on the Users page.

## 6. Deploy from GitHub

1. In the portal, open the web app, **Overview > Download publish profile**.
2. In the GitHub repository: **Settings > Secrets and variables > Actions**.
   Add the secret `AZURE_WEBAPP_PUBLISH_PROFILE` with the file's contents, and the
   variable `AZURE_WEBAPP_NAME` with the web app name (`omr-makerghat`).
3. Push to `main`, or run the **Test and deploy** workflow by hand on `main` (Actions > Test and
   deploy > Run workflow). It runs the tests, builds the React page into `backend/static_site`,
   and deploys the `backend` folder. The variable must exist before the run starts; a run from
   before it was added skips the deploy job.

Open `https://omr-makerghat.azurewebsites.net`, sign up with the admin email, and you are in.

## 7. Optional

- **Custom domain** with a free managed certificate: `az webapp config hostname add ...`, then
  add the domain to the Entra app registration's redirect URIs.
- **Alerts**: enable Application Insights on the web app for error alerts.
- **Backups**: Basic tier keeps 7 days of point-in-time restore. Blob soft delete can be turned
  on in the storage account for accidental deletions.

## Running without Azure

The same code runs on a laptop with SQLite and a local folder; see the README. The only
differences are the three settings `DATABASE_URL`, `AZURE_STORAGE_ACCOUNT_URL` and the sign-in,
which is replaced by `DEV_USER_EMAIL`.
