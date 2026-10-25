@extends('layouts.app')

@section('content')
    @php
        // Layar awal ditentukan server agar halaman landing tidak sempat tampil sebelum JS jalan.
        $staffViews = ['staff', 'dapur', 'kasir', 'display', 'login', 'riwayat', 'stok', 'keuangan', 'menu'];
        $customerFirst = ! in_array(request('view'), $staffViews, true);
    @endphp
    {{-- Bagian statis dirender server; JS hanya mengisi #nav-cart, #menu-region, dan #cart-region. --}}
    <div id="customer-shell" @unless ($customerFirst) hidden @endunless>
        @include('customer.nav')
        <main>
            @include('customer.hero')
            <section class="menu-section" id="menu" aria-labelledby="menu-title">
                <div class="wrap">
                    <div class="section-head reveal">
                        <h2 id="menu-title">Menu</h2>
                    </div>
                    <div id="menu-region"></div>
                </div>
            </section>
            @include('customer.how')
        </main>
        @include('customer.footer')
        <div id="cart-region"></div>
    </div>
    {{-- Layar status pesanan dan semua halaman staf dirender JS di sini. --}}
    <div id="root" @if ($customerFirst) hidden @endif>
        @unless ($customerFirst)
            <p class="state-msg wrap" role="status">Memuat…</p>
        @endunless
    </div>
@endsection
