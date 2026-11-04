import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { HelpModuleScreen, helpModule, helpModules } from "@/features/help";

/** Every topic is known at build time; an unknown one is a 404, not a render. */
export const dynamicParams = false;

export function generateStaticParams() {
  return helpModules().map((m) => ({ module: m.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ module: string }>;
}): Promise<Metadata> {
  const { module: slug } = await params;
  const topic = helpModule(slug);
  return { title: topic ? `${topic.title} · Panduan · Buloo` : "Panduan · Buloo" };
}

export default async function HelpModulePage({
  params,
}: {
  params: Promise<{ module: string }>;
}) {
  const { module: slug } = await params;
  const topic = helpModule(slug);
  if (!topic) notFound();

  return <HelpModuleScreen module={topic} />;
}
