import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { HelpArticleScreen, helpArticle, helpModules } from "@/features/help";

export const dynamicParams = false;

export function generateStaticParams() {
  return helpModules().flatMap((m) =>
    m.articles.map((a) => ({ module: m.slug, article: a.slug })),
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ module: string; article: string }>;
}): Promise<Metadata> {
  const { module, article } = await params;
  const context = helpArticle(module, article);
  return {
    title: context ? `${context.article.title} · ${context.module.title} · Buloo` : "Panduan · Buloo",
  };
}

export default async function HelpArticlePage({
  params,
}: {
  params: Promise<{ module: string; article: string }>;
}) {
  const { module, article } = await params;
  const context = helpArticle(module, article);
  if (!context) notFound();

  return <HelpArticleScreen context={context} />;
}
