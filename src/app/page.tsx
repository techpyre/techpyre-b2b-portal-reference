import { CatalogPanel } from "@/components/catalog/CatalogPanel";
import { CartPanel } from "@/components/cart/CartPanel";

export default function Home() {
  return (
    <main className="mx-auto max-w-[1600px] px-3 pb-8 pt-4 sm:px-5">
      <h1 className="sr-only">Catalogo e ordine rapido</h1>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_400px]">
        <CatalogPanel />
        <CartPanel />
      </div>
    </main>
  );
}
