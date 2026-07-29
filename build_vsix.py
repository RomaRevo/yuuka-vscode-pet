from __future__ import annotations

import argparse
import json
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape


ROOT = Path(__file__).resolve().parent
DIST = ROOT / "dist"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build the Yuuka VS Code Pet VSIX.")
    parser.add_argument("--output", type=Path, help="Optional output path for the VSIX file.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    name = package["name"]
    version = package["version"]
    publisher = package["publisher"]
    vsix = args.output.resolve() if args.output else DIST / f"{name}-{version}.vsix"
    DIST.mkdir(exist_ok=True)
    vsix.parent.mkdir(parents=True, exist_ok=True)

    content_types = """<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="json" ContentType="application/json" />
  <Default Extension="js" ContentType="application/javascript" />
  <Default Extension="css" ContentType="text/css" />
  <Default Extension="png" ContentType="image/png" />
  <Default Extension="webp" ContentType="image/webp" />
  <Default Extension="svg" ContentType="image/svg+xml" />
  <Default Extension="md" ContentType="text/markdown" />
  <Default Extension="py" ContentType="text/plain" />
  <Default Extension="vsixmanifest" ContentType="text/xml" />
</Types>
"""
    manifest = f"""<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011">
  <Metadata>
    <Identity Language="en-US" Id="{escape(name)}" Version="{escape(version)}" Publisher="{escape(publisher)}" />
    <DisplayName>{escape(package['displayName'])}</DisplayName>
    <Description xml:space="preserve">{escape(package['description'])}</Description>
    <Tags>pet,yuuka,blue archive</Tags>
    <Categories>Other</Categories>
    <Properties>
      <Property Id="Microsoft.VisualStudio.Code.Engine" Value="{escape(package['engines']['vscode'])}" />
      <Property Id="Microsoft.VisualStudio.Code.ExtensionDependencies" Value="" />
      <Property Id="Microsoft.VisualStudio.Code.ExtensionPack" Value="" />
      <Property Id="Microsoft.VisualStudio.Code.ExtensionKind" Value="workspace" />
      <Property Id="Microsoft.VisualStudio.Services.Content.Pricing" Value="Free" />
    </Properties>
    <Icon>extension/media/icon.png</Icon>
  </Metadata>
  <Installation>
    <InstallationTarget Id="Microsoft.VisualStudio.Code" />
  </Installation>
  <Dependencies />
  <Assets>
    <Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true" />
    <Asset Type="Microsoft.VisualStudio.Services.Content.Details" Path="extension/README.md" Addressable="true" />
    <Asset Type="Microsoft.VisualStudio.Services.Icons.Default" Path="extension/media/icon.png" Addressable="true" />
  </Assets>
</PackageManifest>
"""

    files = [
        "package.json",
        "extension.js",
        "reactionPolicy.js",
        "productivityState.js",
        "productivityController.js",
        "README.md",
        "PRIVACY.md",
        "CHANGELOG.md",
        "media/style.css",
        "media/dialogue.js",
        "media/dialoguePolicy.js",
        "media/relationshipDialogue.js",
        "media/main.js",
        "media/activity-icon.svg",
        "media/icon.png",
        "media/scene-office-v1.png",
        "media/spritesheet.png",
        "media/spritesheet-pajama.webp",
    ]
    with zipfile.ZipFile(vsix, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", content_types)
        archive.writestr("extension.vsixmanifest", manifest)
        for relative in files:
            archive.write(ROOT / relative, f"extension/{relative}")
    print(vsix)


if __name__ == "__main__":
    main()
