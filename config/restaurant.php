<?php

// Alamat, jam buka, dan kontak tampil di footer hanya bila diisi lewat .env.
return [
    'name' => 'Nusantara Bites',
    'address' => env('RESTO_ADDRESS'),
    'hours' => env('RESTO_HOURS'),
    'phone' => env('RESTO_PHONE'),
];
