<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;

class CreateStaffUser extends Command
{
    protected $signature = 'staff:create
                            {username : Username akun staf}
                            {role : owner, kasir, atau dapur}';

    protected $description = 'Membuat atau memperbarui akun staf';

    public function handle(): int
    {
        $username = $this->argument('username');
        $role = $this->argument('role');

        if (!in_array($role, ['owner', 'kasir', 'dapur'], true)) {
            $this->error('Role harus owner, kasir, atau dapur.');
            return self::FAILURE;
        }

        $password = $this->secret('Masukkan kata sandi (minimal 10 karakter)');

        if (!$password || strlen($password) < 10) {
            $this->error('Kata sandi minimal 10 karakter.');
            return self::FAILURE;
        }

        $confirm = $this->secret('Ulangi kata sandi');

        if ($password !== $confirm) {
            $this->error('Kata sandi tidak cocok.');
            return self::FAILURE;
        }

        $exists = DB::table('users')
            ->where('username', $username)
            ->exists();

        $data = [
            'password_hash' => password_hash($password, PASSWORD_DEFAULT),
            'role' => $role,
            'is_active' => 1,
        ];

        if ($exists) {
            DB::table('users')
                ->where('username', $username)
                ->update($data);

            $this->info("Akun {$username} berhasil diperbarui.");
        } else {
            DB::table('users')->insert([
                'username' => $username,
                ...$data,
                'created_at' => now()->valueOf(),
            ]);

            $this->info("Akun {$username} berhasil dibuat.");
        }

        return self::SUCCESS;
    }
}
?>