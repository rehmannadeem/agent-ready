$ErrorActionPreference = 'Stop'
# Tighten only this project's private directory. Do not pass an arbitrary target.
$privatePath = Join-Path $PSScriptRoot 'private'
if (-not (Test-Path -LiteralPath $privatePath)) {
    New-Item -ItemType Directory -Path $privatePath | Out-Null
}
$owner = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$acl = [System.Security.AccessControl.DirectorySecurity]::new()
$acl.SetOwner($owner)
$acl.SetAccessRuleProtection($true, $false)
$rule = [System.Security.AccessControl.FileSystemAccessRule]::new(
    $owner,
    [System.Security.AccessControl.FileSystemRights]::FullControl,
    [System.Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit',
    [System.Security.AccessControl.PropagationFlags]::None,
    [System.Security.AccessControl.AccessControlType]::Allow
)
$acl.AddAccessRule($rule)
Set-Acl -LiteralPath $privatePath -AclObject $acl
$verified = Get-Acl -LiteralPath $privatePath
$unexpected = @($verified.Access | Where-Object {
    $_.AccessControlType -eq 'Allow' -and
    $_.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value -ne $owner.Value
})
if (-not $verified.AreAccessRulesProtected -or $unexpected.Count -ne 0) {
    throw 'Private directory ACL verification failed.'
}
Write-Output 'Private directory ACL restricted to the current Windows user; no credential values read.'
