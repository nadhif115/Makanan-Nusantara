<footer class="site-footer">
    <div class="wrap">
        <div>
            <b>{{ config('restaurant.name') }}</b>
            @if (config('restaurant.address')) <div>{{ config('restaurant.address') }}</div> @endif
            @if (config('restaurant.hours')) <div>{{ config('restaurant.hours') }}</div> @endif
            @if (config('restaurant.phone')) <div>{{ config('restaurant.phone') }}</div> @endif
        </div>
        <div>
            <a href="#menu">Menu</a><a href="#cara-pesan">Cara pesan</a><a href="?view=staff">Halaman staf</a>
        </div>
    </div>
</footer>
