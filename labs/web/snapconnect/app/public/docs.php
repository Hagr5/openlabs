<?php

declare(strict_types=1);

header('Content-Type: text/html; charset=utf-8');
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SnapConnect API docs</title>
<link rel="stylesheet" type="text/css" href="/assets/swagger-ui/swagger-ui.css">
<link rel="icon" type="image/png" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='9' fill='%23c8f830'/%3E%3Ccircle cx='16' cy='16' r='7' fill='none' stroke='%23151a04' stroke-width='3'/%3E%3Ccircle cx='22' cy='10' r='3' fill='%23151a04'/%3E%3C/svg%3E">
<style>
    html { box-sizing: border-box; overflow-y: scroll; }
    *, *:before, *:after { box-sizing: inherit; }
    body { margin: 0; background: #fafafa; }
</style>
</head>

<body>
<div id="swagger-ui"></div>

<script src="/assets/swagger-ui/swagger-ui-bundle.js"></script>
<script>
    window.onload = function () {
        window.ui = SwaggerUIBundle({
            url: "/openapi.json",
            dom_id: "#swagger-ui",
            deepLinking: true,
            presets: [SwaggerUIBundle.presets.apis]
        });
    };
</script>
</body>
</html>
