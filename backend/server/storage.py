"""Where sheet images live: a local folder, or Azure Blob Storage with managed identity."""
from __future__ import annotations

from pathlib import Path


class LocalStorage:
    def __init__(self, root: Path):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        p = (self.root / key).resolve()
        if self.root.resolve() not in p.parents:
            raise ValueError("bad storage key")
        return p

    def put(self, key: str, data: bytes, content_type: str = "application/octet-stream") -> None:
        p = self._path(key)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)

    def get(self, key: str) -> bytes:
        return self._path(key).read_bytes()

    def delete_prefix(self, prefix: str) -> None:
        import shutil
        p = self._path(prefix)
        if p.is_dir():
            shutil.rmtree(p)


class BlobStorage:
    """Uses DefaultAzureCredential: the App Service managed identity in Azure, your `az login` locally."""

    def __init__(self, account_url: str, container: str):
        from azure.identity import DefaultAzureCredential
        from azure.storage.blob import BlobServiceClient

        self.client = BlobServiceClient(account_url=account_url, credential=DefaultAzureCredential())
        self.container = self.client.get_container_client(container)

    def put(self, key: str, data: bytes, content_type: str = "application/octet-stream") -> None:
        from azure.storage.blob import ContentSettings
        self.container.upload_blob(key, data, overwrite=True, content_settings=ContentSettings(content_type=content_type))

    def get(self, key: str) -> bytes:
        return self.container.download_blob(key).readall()

    def delete_prefix(self, prefix: str) -> None:
        for blob in self.container.list_blobs(name_starts_with=prefix):
            self.container.delete_blob(blob.name)


def make_storage(settings):
    if settings.AZURE_STORAGE_ACCOUNT_URL:
        return BlobStorage(settings.AZURE_STORAGE_ACCOUNT_URL, settings.AZURE_STORAGE_CONTAINER)
    return LocalStorage(settings.STORAGE_ROOT)
