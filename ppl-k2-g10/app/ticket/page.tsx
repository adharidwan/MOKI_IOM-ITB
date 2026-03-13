// src/app/ticket/page.tsx
import TicketTable from "../components/TicketTable";
import { getTickets } from "../lib/api";

export default async function TicketDashboard({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const resolvedSearchParams = await searchParams;
  const page = Number(resolvedSearchParams.page) || 1;
  const search = (resolvedSearchParams.search as string) || "";
  const sort = (resolvedSearchParams.sort as string) || "created_at";

  const data = await getTickets({ page, search, sort });

  return (
    <main style={{ padding: "2rem" }}>
      <h1>Ticket Dashboard</h1>
      <TicketTable initialData={data.tickets} totalCount={data.total} />
    </main>
  );
}
