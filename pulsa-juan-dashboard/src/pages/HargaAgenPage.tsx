import PricingGrid from '../components/PricingGrid';

export default function HargaAgenPage() {
  return (
    <PricingGrid
      field="hargaAgen"
      title="Harga Agen"
      subtitle="Harga yang dibayar agen per produk. Pilih agen di kanan atas untuk memberi harga spesial ke agen tersebut."
    />
  );
}
