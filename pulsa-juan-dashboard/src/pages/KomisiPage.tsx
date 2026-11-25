import PricingGrid from '../components/PricingGrid';

export default function KomisiPage() {
  return (
    <PricingGrid
      field="commission"
      title="Komisi"
      subtitle="Komisi pengajak per produk, dibayar ke upline setiap transaksi sukses mitranya. Pilih agen untuk memberi komisi spesial ke agen tersebut."
    />
  );
}
