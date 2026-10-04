import {
  WHY_CARDS,
  type MockBar,
  type MockRow,
  type MockTag,
} from "../content";

/*
  ONE TINT VOCABULARY, the same one the product's badges use — ui-rules §9: pale
  named fill, saturated ink, no border. `neutral` is the only one that takes a
  hairline, because a grey chip with no edge disappears into the row behind it.
*/
const TAG_TONE: Record<MockTag["tone"], string> = {
  brand: "bg-tint-brand text-primary",
  success: "bg-tint-success text-success",
  warning: "bg-tint-warning text-warning",
  neutral: "border border-border bg-background text-muted",
};

function Tag({ tag }: { tag: MockTag }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap ${TAG_TONE[tag.tone]}`}
    >
      {tag.label}
    </span>
  );
}

/** One line of a mock screen: what happened, who did it, and the figure. */
function Row({ row }: { row: MockRow }) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2.5">
      <span className="min-w-0">
        <span className="block text-sm leading-snug font-semibold">
          {row.title}
        </span>
        <span className="block text-xs text-muted">{row.detail}</span>
      </span>
      {row.count && (
        <span
          className={`font-display text-lg font-extrabold tabular-nums ${
            row.countGood ? "text-success" : ""
          }`}
        >
          {row.count}
        </span>
      )}
      {row.tag && <Tag tag={row.tag} />}
    </li>
  );
}

/** The label, the track and the figure share one scale. */
function Bar({ bar }: { bar: MockBar }) {
  return (
    <li>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-semibold">{bar.label}</span>
        <span className="text-xs tabular-nums text-muted">{bar.value}</span>
      </div>
      <span className="mt-1 block h-2 overflow-hidden rounded-full border border-border bg-surface">
        <span
          className={`block h-full rounded-full ${bar.accent ? "bg-secondary" : "bg-info"}`}
          style={{ width: `${bar.share}%` }}
        />
      </span>
    </li>
  );
}

/**
 * The four reasons, each with a piece of the screen that backs it up.
 *
 * A CLAIM AND ITS EVIDENCE SIT IN THE SAME CARD. "Analitik yang mengerti
 * pelanggan petshop" is a sentence any kasir app could write; the three rows
 * under it — lapsed customers, new ones this month, vaccinations falling due —
 * are the part a general-purpose till has nowhere to put.
 *
 * THE MOCK SITS AT THE BOTTOM OF THE CARD (`mt-auto`), so four cards of unequal
 * copy still line their panels up across the grid.
 */
export function WhyCards() {
  return (
    <ul className="grid gap-6 lg:grid-cols-2">
      {WHY_CARDS.map((card) => (
        <li
          key={card.title}
          className="flex flex-col rounded-2xl border border-border bg-surface p-6"
        >
          <h3 className="text-xl leading-tight font-bold">{card.title}</h3>
          <p className="mt-2 mb-5 text-[15px] text-muted">{card.body}</p>

          <div className="mt-auto rounded-xl bg-background p-3.5">
            <p className="mb-2.5 text-xs font-bold text-muted uppercase">
              {card.caption}
            </p>

            {card.bars && (
              <ul className="mb-2.5 flex flex-col gap-2">
                {card.bars.map((bar) => (
                  <Bar key={bar.label} bar={bar} />
                ))}
              </ul>
            )}

            <ul className="flex flex-col gap-1.5">
              {card.rows.map((row) => (
                <Row key={row.title} row={row} />
              ))}
            </ul>
          </div>
        </li>
      ))}
    </ul>
  );
}
