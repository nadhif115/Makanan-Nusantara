<header class="site-nav" id="site-nav">
    <div class="wrap">
        <a class="brand" href="#top"><?php echo e(config('restaurant.name')); ?></a>
        <nav class="nav-links" id="nav-links" aria-label="Navigasi utama">
            <a href="#menu">Menu</a>
            <a href="#cara-pesan">Cara pesan</a>
        </nav>
        <span class="nav-table">Meja <b><?php echo e(request('meja', request('table', '1'))); ?></b></span>
        <span id="nav-cart"></span>
        <button class="nav-toggle" type="button" data-act="toggle-nav" aria-expanded="false" aria-controls="nav-links">Menu</button>
    </div>
</header>
<?php /**PATH D:\laragon\www\nusantara-app\resources\views/customer/nav.blade.php ENDPATH**/ ?>