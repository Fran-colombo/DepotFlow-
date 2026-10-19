import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import Dashboard from "./Dashboard";
import { MANUAL_SECTIONS } from "../manual/manualContent";

const QUICK_SEARCHES = ["retirar", "devolver", "código", "remito", "rota", "km", "pendientes", "caja"];

function normalize(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function blockText(block) {
  if (block.text) return block.text;
  if (block.items) return block.items.join(" ");
  if (block.rows) return block.rows.map((row) => `${row.name} ${row.text}`).join(" ");
  return "";
}

const TOPICS = MANUAL_SECTIONS.flatMap((section) =>
  section.topics.map((topic) => ({
    ...topic,
    sectionId: section.id,
    sectionTitle: section.title,
    head: normalize(`${topic.title} ${topic.summary} ${topic.keywords.join(" ")}`),
    full: normalize(topic.body.map(blockText).join(" ")),
  }))
);

const TOPIC_BY_ID = Object.fromEntries(TOPICS.map((topic) => [topic.id, topic]));

function Rich({ text }) {
  const parts = String(text).split(/\*\*(.+?)\*\*/g);
  return parts.map((part, index) => (index % 2 === 1 ? <strong key={index}>{part}</strong> : part));
}

function Block({ block }) {
  if (block.type === "steps") {
    return (
      <ol className="mb-3 ps-3">
        {block.items.map((item, index) => (
          <li key={index} className="mb-1"><Rich text={item} /></li>
        ))}
      </ol>
    );
  }
  if (block.type === "list") {
    return (
      <ul className="mb-3 ps-3">
        {block.items.map((item, index) => (
          <li key={index} className="mb-1"><Rich text={item} /></li>
        ))}
      </ul>
    );
  }
  if (block.type === "tip") {
    return <div className="alert alert-info py-2 small mb-3"><Rich text={block.text} /></div>;
  }
  if (block.type === "warn") {
    return <div className="alert alert-warning py-2 small mb-3"><Rich text={block.text} /></div>;
  }
  if (block.type === "compare") {
    return (
      <div className="border rounded mb-3">
        {block.rows.map((row, index) => (
          <div key={row.name} className={`p-2 ${index > 0 ? "border-top" : ""}`}>
            <div className="fw-semibold">{row.name}</div>
            <div className="small"><Rich text={row.text} /></div>
          </div>
        ))}
      </div>
    );
  }
  return <p className="mb-3"><Rich text={block.text} /></p>;
}

function TopicCard({ topic, showSection, onOpen }) {
  return (
    <div className="col-12 col-md-6 col-lg-4">
      <button
        type="button"
        className="card h-100 w-100 text-start border shadow-sm p-3 bg-white"
        onClick={() => onOpen(topic.id)}
      >
        {showSection && <div className="small app-muted mb-1">{topic.sectionTitle}</div>}
        <div className="fw-semibold mb-1">{topic.title}</div>
        <div className="small app-muted">{topic.summary}</div>
      </button>
    </div>
  );
}

function searchTopics(query) {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return TOPICS
    .map((topic) => {
      let score = 0;
      for (const word of words) {
        if (topic.head.includes(word)) score += normalize(topic.title).includes(word) ? 3 : 2;
        else if (topic.full.includes(word)) score += 1;
        else return null;
      }
      return { topic, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.topic);
}

const Manual = () => {
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState(null);
  const open = openId ? TOPIC_BY_ID[openId] : null;
  const results = useMemo(() => searchTopics(query), [query]);
  const searching = query.trim().length > 0;

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") setOpenId(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <Dashboard title="Manual de uso">
      <p className="app-muted">
        Todo lo que podés hacer en el sistema y cómo hacerlo. Buscá una palabra o tocá un tema para ver la explicación.
      </p>

      <div className="input-group mb-2">
        <span className="input-group-text bg-white"><Search size={18} /></span>
        <input
          className="form-control"
          type="search"
          placeholder="Buscá lo que necesitás, por ejemplo: devolver, código, remito, km"
          value={query}
          autoFocus
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="d-flex flex-wrap gap-2 mb-4">
        {QUICK_SEARCHES.map((word) => (
          <button key={word} type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setQuery(word)}>
            {word}
          </button>
        ))}
      </div>

      {searching ? (
        <>
          <div className="small app-muted mb-2">
            {results.length === 0
              ? "No encontramos nada con esa búsqueda. Probá con otra palabra, por ejemplo retirar, pieza o remito."
              : `${results.length} ${results.length === 1 ? "tema" : "temas"}`}
          </div>
          <div className="row g-3">
            {results.map((topic) => (
              <TopicCard key={topic.id} topic={topic} showSection onOpen={setOpenId} />
            ))}
          </div>
        </>
      ) : (
        MANUAL_SECTIONS.map((section) => (
          <section key={section.id} className="mb-4">
            <h2 className="h5 mb-1">{section.title}</h2>
            <p className="small app-muted mb-2">{section.intro}</p>
            <div className="row g-3">
              {section.topics.map((topic) => (
                <TopicCard key={topic.id} topic={TOPIC_BY_ID[topic.id]} onOpen={setOpenId} />
              ))}
            </div>
          </section>
        ))
      )}

      {open && (
        <div className="modal show d-block" style={{ backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1050 }} onClick={() => setOpenId(null)}>
          <div className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable" onClick={(e) => e.stopPropagation()}>
            <div className="modal-content">
              <div className="modal-header">
                <div>
                  <div className="small app-muted">{open.sectionTitle}</div>
                  <h5 className="modal-title mb-0">{open.title}</h5>
                </div>
                <button type="button" className="btn-close" aria-label="Cerrar" onClick={() => setOpenId(null)}></button>
              </div>
              <div className="modal-body">
                {open.body.map((block, index) => (
                  <Block key={`${open.id}-${index}`} block={block} />
                ))}
                {(open.related || []).length > 0 && (
                  <div className="border-top pt-3">
                    <div className="small fw-semibold mb-2">Ver también</div>
                    <div className="d-flex flex-wrap gap-2">
                      {open.related.filter((id) => TOPIC_BY_ID[id]).map((id) => (
                        <button key={id} type="button" className="btn btn-sm btn-outline-primary" onClick={() => setOpenId(id)}>
                          {TOPIC_BY_ID[id].title}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline-secondary" onClick={() => setOpenId(null)}>Cerrar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Dashboard>
  );
};

export default Manual;
