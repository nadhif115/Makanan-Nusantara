<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <title><?php echo e(config('restaurant.name')); ?></title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=Public+Sans:wght@400;500;600&display=swap" rel="stylesheet">
    <?php echo app('Illuminate\Foundation\Vite')(['resources/css/site.css', 'resources/js/site.js']); ?>
</head>
<body>
    <?php echo $__env->yieldContent('content'); ?>
    <noscript><p style="padding:24px">Halaman ini membutuhkan JavaScript untuk memesan.</p></noscript>
</body>
</html>
<?php /**PATH D:\laragon\www\nusantara-app\resources\views/layouts/app.blade.php ENDPATH**/ ?>