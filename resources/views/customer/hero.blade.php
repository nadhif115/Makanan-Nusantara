<section class="hero" id="top">
    <div class="wrap">
        <div>
            <p class="eyebrow rise" style="--i:0">Masakan Nusantara</p>
            <h1 class="rise" style="--i:1">Masakan daerah, dipesan dari meja Anda.</h1>
            <p class="lead rise" style="--i:2">Pilih hidangan, kirim pesanan, lalu ambil saat nomor antrean Anda dipanggil.</p>
            <div class="hero-cta rise" style="--i:3">
                <a class="btn btn-primary" href="#menu">Lihat menu</a>
                <a class="btn btn-quiet" href="#cara-pesan">Cara pesan</a>
            </div>
        </div>
        <div class="hero-panel rise" style="--i:2" data-parallax>
            <div class="hero-fallback">
                <span>Meja</span><strong>{{ request('meja', request('table', '1')) }}</strong><small>Pesanan Anda diantar ke nomor ini</small>
            </div>
            {{-- Letakkan foto di public/images/hero.jpg; bila tidak ada, panel meja di atas yang tampil. --}}
            <img src="{{ asset('images/hero.jpg') }}" alt="" data-fallback>
        </div>
    </div>
</section>
