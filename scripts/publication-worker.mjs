// Scheduling was removed by ADR-036. Preserve durable history without executing
// old pending jobs through a retired CLI command.
console.error("Penjadwalan publikasi sudah dihapus. Worker tidak dijalankan; riwayat jadwal tetap tersimpan.");
process.exitCode = 1;
