[CmdletBinding()]
param(
    [switch]$KeepRunning
)

$ErrorActionPreference = 'Stop'
$challengeRoot = Split-Path -Parent $PSScriptRoot

function Invoke-Docker {
    param(
        [Parameter(ValueFromRemainingArguments = $true)]
        [string[]]$Arguments
    )

    & docker @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Docker command failed: docker $($Arguments -join ' ')"
    }
}

function Assert-HardenedContainer {
    param(
        [string]$ContainerId,
        [string]$Label
    )

    $inspection = (Invoke-Docker -Arguments @('inspect', $ContainerId) | ConvertFrom-Json)[0]
    $hostConfig = $inspection.HostConfig

    if ($hostConfig.Privileged -or -not $hostConfig.ReadonlyRootfs) {
        throw "$Label must be unprivileged and use a read-only root filesystem."
    }
    if (-not $hostConfig.PidsLimit -or $hostConfig.PidsLimit -le 0) {
        throw "$Label must define a positive PID limit."
    }
    if ($hostConfig.CapDrop -notcontains 'ALL') {
        throw "$Label must drop all Linux capabilities before explicit additions."
    }
    if ($hostConfig.SecurityOpt -notcontains 'no-new-privileges:true') {
        throw "$Label must enable no-new-privileges."
    }
    if ($inspection.Mounts.Count -ne 0) {
        throw "$Label must not use host or named-volume mounts."
    }
}

function Invoke-LabReset {
    & python (Join-Path $challengeRoot 'reset.py')
    if ($LASTEXITCODE -ne 0) {
        throw 'firmdrama clean reset failed.'
    }
    # Reset replaces both containers; never inspect or exec the old IDs.
    $script:containerId = (Invoke-Docker -Arguments @('compose', 'ps', '-q', 'firmdrama')).Trim()
    $script:ingressId = (Invoke-Docker -Arguments @('compose', 'ps', '-q', 'firmdrama_ingress')).Trim()
}

Push-Location $challengeRoot
try {
    Write-Host '[1/10] Removing any previous firmdrama release state.'
    Invoke-Docker -Arguments @('compose', 'down', '--remove-orphans')

    Write-Host '[2/10] Building pinned images and starting the clean release candidate.'
    Invoke-Docker -Arguments @('compose', 'build', '--pull', '--no-cache')
    Invoke-Docker -Arguments @('compose', 'up', '-d', '--wait')

    $containerId = (Invoke-Docker -Arguments @('compose', 'ps', '-q', 'firmdrama')).Trim()
    $ingressId = (Invoke-Docker -Arguments @('compose', 'ps', '-q', 'firmdrama_ingress')).Trim()
    if (-not $containerId -or -not $ingressId) {
        throw 'Both firmdrama containers must be created.'
    }

    Write-Host '[3/10] Resetting and verifying the generated environment.'
    Invoke-LabReset
    Invoke-Docker -Arguments @('exec', $containerId, 'python3', '/opt/firmdrama/scripts/verify_environment.py')

    Write-Host '[4/10] Running the automated validation suite from the read-only image.'
    Invoke-Docker -Arguments @(
        'exec', $containerId, 'sh', '-lc',
        'cd /opt/firmdrama-tests && PYTHONPATH=/opt/firmdrama python3 -m pytest -q -p no:cacheprovider'
    )

    Write-Host '[5/10] Resetting and running the API-only solver through the published ingress.'
    Invoke-LabReset
    & python 'solver/solve_api_only.py' 'http://127.0.0.1:8080'
    if ($LASTEXITCODE -ne 0) {
        throw 'The API-only solver failed through the published ingress endpoint.'
    }
    Invoke-LabReset

    Write-Host '[6/10] Verifying runtime identity and final-file permissions.'
    Invoke-Docker -Arguments @('exec', $containerId, '/opt/firmdrama/scripts/verify_runtime_security.sh')

    Write-Host '[7/10] Verifying the complete Docker network and port topology.'
    $appNetworks = ((Invoke-Docker -Arguments @('inspect', '-f', '{{json .NetworkSettings.Networks}}', $containerId)).Trim() | ConvertFrom-Json)
    $ingressNetworks = ((Invoke-Docker -Arguments @('inspect', '-f', '{{json .NetworkSettings.Networks}}', $ingressId)).Trim() | ConvertFrom-Json)
    $appNetworkNames = @($appNetworks.PSObject.Properties.Name)
    $ingressNetworkNames = @($ingressNetworks.PSObject.Properties.Name)

    if ($appNetworkNames.Count -ne 1) {
        throw "The application must have exactly one network; found $($appNetworkNames.Count)."
    }
    $appInternal = (Invoke-Docker -Arguments @('network', 'inspect', '-f', '{{.Internal}}', $appNetworkNames[0])).Trim()
    if ($appInternal -ne 'true') {
        throw 'The application network must be internal.'
    }
    $internalNetwork = (Invoke-Docker -Arguments @('network', 'inspect', $appNetworkNames[0]) | ConvertFrom-Json)[0]
    if ($internalNetwork.Driver -ne 'bridge' -or $internalNetwork.EnableIPv6 -or
        $internalNetwork.Options.'com.docker.network.bridge.gateway_mode_ipv4' -ne 'isolated') {
        throw 'The application requires an IPv4-only bridge with isolated gateway mode.'
    }
    if (@($internalNetwork.IPAM.Config | Where-Object { $_.Gateway }).Count -ne 0) {
        throw 'The isolated application bridge must not have a host gateway address.'
    }
    if ($ingressNetworkNames.Count -ne 2 -or $ingressNetworkNames -notcontains $appNetworkNames[0]) {
        throw 'Ingress must connect only the internal application network and one publishing bridge.'
    }
    $publishingNetwork = $ingressNetworkNames | Where-Object { $_ -ne $appNetworkNames[0] }
    $publishingInternal = (Invoke-Docker -Arguments @('network', 'inspect', '-f', '{{.Internal}}', $publishingNetwork)).Trim()
    if ($publishingInternal -ne 'false') {
        throw 'The publishing bridge must be non-internal for Docker Desktop port forwarding.'
    }
    $publishedPort = (Invoke-Docker -Arguments @('port', $ingressId, '8000/tcp')).Trim()
    if ($publishedPort -ne '127.0.0.1:8080') {
        throw "Expected loopback-only publishing, found '$publishedPort'."
    }

    Write-Host '[8/10] Verifying container hardening and ingress image separation.'
    Assert-HardenedContainer -ContainerId $containerId -Label 'firmdrama application'
    Assert-HardenedContainer -ContainerId $ingressId -Label 'firmdrama ingress'
    $ingressUser = (Invoke-Docker -Arguments @('inspect', '-f', '{{.Config.User}}', $ingressId)).Trim()
    if (-not $ingressUser -or $ingressUser -eq 'root' -or $ingressUser -eq '0') {
        throw 'Ingress must run as a declared non-root image user.'
    }
    Invoke-Docker -Arguments @(
        'run', '--rm', '--entrypoint', 'sh', 'firmdrama-ingress:local', '-c',
        'test ! -e /opt/firmdrama && test ! -e /app/solver && test ! -e /app/src && ! command -v pip && ! command -v pip3 && ! python3 -c "import pip" 2>/dev/null && test ! -e /usr/local/lib/python3.12/ensurepip'
    )

    Write-Host '[9/10] Verifying generated-flag secrecy in source, image history, and container metadata.'
    Invoke-Docker -Arguments @(
        'exec', $containerId, 'python3', '/opt/firmdrama/scripts/check_source_secrets.py'
    )
    $imageHistory = Invoke-Docker -Arguments @('history', '--no-trunc', 'firmdrama:local')
    $containerConfig = Invoke-Docker -Arguments @('inspect', '-f', '{{json .Config}}', $containerId)
    if (($imageHistory -join [Environment]::NewLine) -match 'duck\{[a-z]{24}\}' -or $containerConfig -match 'duck\{[a-z]{24}\}') {
        throw 'A generated flag-like value was found in image history or container metadata.'
    }
}
finally {
    if (-not $KeepRunning) {
        Write-Host '[10/10] Tearing down the release candidate.'
        Invoke-Docker -Arguments @('compose', 'down', '--remove-orphans')
    }
    else {
        Write-Host '[10/10] KeepRunning selected; release candidate remains active.'
    }
    Pop-Location
}

Write-Host 'firmdrama release validation passed.'
