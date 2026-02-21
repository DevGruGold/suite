$functionsDir = "c:\Users\PureTrek\Desktop\DevGruGold\suite\supabase\functions"
$results = @{}
$skip = @("_shared","tests")

Get-ChildItem $functionsDir -Directory | Where-Object { $_.Name -notin $skip } | ForEach-Object {
    $fnName = $_.Name
    $indexFile = Join-Path $_.FullName "index.ts"
    if (Test-Path $indexFile) {
        $content = Get-Content $indexFile -Raw -ErrorAction SilentlyContinue
        if ($content) {
            # Extract case "action-name" patterns
            $cases = [regex]::Matches($content, 'case\s+"([^"]+)"') | ForEach-Object { $_.Groups[1].Value }
            $casesS = [regex]::Matches($content, "case\s+'([^']+)'") | ForEach-Object { $_.Groups[1].Value }
            # Extract action === "..." patterns
            $eqD = [regex]::Matches($content, 'action\s*===\s*"([^"]+)"') | ForEach-Object { $_.Groups[1].Value }
            $eqS = [regex]::Matches($content, "action\s*===\s*'([^']+)'") | ForEach-Object { $_.Groups[1].Value }
            # Extract action == patterns  
            $eq2D = [regex]::Matches($content, 'action\s*==\s*"([^"]+)"') | ForEach-Object { $_.Groups[1].Value }
            $eq2S = [regex]::Matches($content, "action\s*==\s*'([^']+)'") | ForEach-Object { $_.Groups[1].Value }
            
            $all = (@($cases) + @($casesS) + @($eqD) + @($eqS) + @($eq2D) + @($eq2S)) | Select-Object -Unique | Where-Object { 
                $_ -notmatch "^(OPTIONS|GET|POST|PUT|DELETE|PATCH|in_progress|completed|failed|status|error|success)$" -and $_.Length -gt 1 
            }
            
            # Also check if function uses req.json()
            $hasBody = $content -match 'await req\.json\(\)'
            $isGetOnly = $content -match 'req\.method.*GET' -and -not ($content -match 'req\.json\(\)')
            
            # Check for required param patterns
            $reqParams = [regex]::Matches($content, '"([a-z_]+)"\s*is required') | ForEach-Object { $_.Groups[1].Value }
            $reqParams2 = [regex]::Matches($content, "Missing required.*?'([a-z_]+)'") | ForEach-Object { $_.Groups[1].Value }
            $reqParams3 = [regex]::Matches($content, 'Missing\s+([a-z_]+)') | ForEach-Object { $_.Groups[1].Value }
            $allReq = (@($reqParams) + @($reqParams2) + @($reqParams3)) | Select-Object -Unique
            
            $results[$fnName] = @{
                actions = $all
                required_params = $allReq
                has_body = $hasBody
            }
        }
    }
}

# Output as structured text
$results.GetEnumerator() | Sort-Object Name | ForEach-Object {
    $fn = $_.Key
    $info = $_.Value
    $actions = if ($info.actions.Count -gt 0) { $info.actions -join "|" } else { "NONE" }
    $required = if ($info.required_params.Count -gt 0) { $info.required_params -join "|" } else { "" }
    Write-Output "$fn`t$actions`t$required"
}
