<footer class="site-footer">
    <div class="wrap">
        <div>
            <b><?php echo e(config('restaurant.name')); ?></b>
            <?php if(config('restaurant.address')): ?> <div><?php echo e(config('restaurant.address')); ?></div> <?php endif; ?>
            <?php if(config('restaurant.hours')): ?> <div><?php echo e(config('restaurant.hours')); ?></div> <?php endif; ?>
            <?php if(config('restaurant.phone')): ?> <div><?php echo e(config('restaurant.phone')); ?></div> <?php endif; ?>
        </div>
        <div>
            <a href="#menu">Menu</a><a href="#cara-pesan">Cara pesan</a><a href="?view=staff">Halaman staf</a>
        </div>
    </div>
</footer>
<?php /**PATH D:\laragon\www\nusantara-app\resources\views/customer/footer.blade.php ENDPATH**/ ?>