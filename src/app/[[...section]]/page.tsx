import StudioApp from "@/components/studio-app";
import { notFound } from "next/navigation";
const destinations = [
  "learn",
  "practice",
  "coach",
  "design",
  "equipment",
  "progress",
  "library",
  "settings",
];
export default async function Page({
  params,
}: {
  params: Promise<{ section?: string[] }>;
}) {
  const { section } = await params;
  if (section && (section.length !== 1 || !destinations.includes(section[0])))
    notFound();
  return <StudioApp section={section?.[0] || "dashboard"} />;
}
