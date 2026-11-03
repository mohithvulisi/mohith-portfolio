import { useEffect, useRef } from "react";
import { portfolio } from "../content/portfolio";
import { useStore } from "../store/useStore";

const external = { target: "_blank", rel: "noopener noreferrer" };

// Same content as the volume, as an ordinary document: for recruiters, screen
// readers, and any browser without WebGL.
export function PlainVersion({ canReturn = true }) {
  const heading = useRef();
  const p = portfolio;
  useEffect(() => heading.current?.focus(), []);
  const links = [
    { label: "Email", value: p.links.email?.replace(/^mailto:/, ""), href: p.links.email },
    { label: "Phone", value: p.links.phone, href: p.links.phone && `tel:${p.links.phone.replace(/\s+/g, "")}` },
    { label: "GitHub", value: p.links.github?.replace(/^https?:\/\//, ""), href: p.links.github },
    { label: "LeetCode", value: p.links.leetcode?.replace(/^https?:\/\//, ""), href: p.links.leetcode },
    { label: "LinkedIn", value: p.links.linkedin?.replace(/^https?:\/\/(www\.)?/, ""), href: p.links.linkedin }
  ].filter((l) => l.href);

  return (
    <div className="plain">
      <main className="plain__page">
        {canReturn && (
          <button type="button" className="plain__back" onClick={() => useStore.setState({ plain: false })}>
            Back to the 3D volume
          </button>
        )}
        <header className="plain__header">
          <p className="plain__tagline">{p.tagline}</p>
          <h1 ref={heading} tabIndex={-1} className="plain__name">
            {p.name}
          </h1>
          <p className="plain__role">{p.role}</p>
          <p className="plain__meta">
            {p.college.name}, {p.college.branch}, {p.college.year}
          </p>
          {p.extraRole && <p className="plain__badge">{p.extraRole}</p>}
        </header>

        <section aria-labelledby="plain-projects">
          <h2 id="plain-projects">Projects</h2>
          <p className="plain__note">
            All projects are on <a href={p.links.github} {...external}>GitHub</a>.
          </p>
          {p.years.map((year) => (
            <div key={year.label} className="plain__group">
              <h3>{year.label}</h3>
              <ul>
                {year.projects.map((project) => (
                  <li key={project.title}>
                    <a href={project.repoUrl ?? p.links.github} {...external}>
                      {project.title}
                    </a>
                    {project.note && <span className="plain__aside">{project.note}</span>}
                    {project.description && <p>{project.description}</p>}
                    {project.stack?.length > 0 && <p className="plain__aside">{project.stack.join(", ")}</p>}
                    {project.liveUrl && (
                      <a className="plain__aside" href={project.liveUrl} {...external}>
                        Live project
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        <section aria-labelledby="plain-hackathons">
          <h2 id="plain-hackathons">Hackathons</h2>
          <ul>
            {p.hackathons.map((h) => (
              <li key={h.name}>
                {h.name}
                {h.note && <span className="plain__aside">{h.note}</span>}
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="plain-certificates">
          <h2 id="plain-certificates">Certificates</h2>
          <ul>
            {p.certificates.map((c) => (
              <li key={c.name}>
                {c.certificateUrl ? (
                  <a href={c.certificateUrl} {...external}>
                    {c.name}
                  </a>
                ) : (
                  c.name
                )}
                {c.issuer && <span className="plain__aside">{c.issuer}</span>}
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="plain-contact">
          <h2 id="plain-contact">Contact</h2>
          <ul className="plain__links">
            {links.map((l) => (
              <li key={l.label}>
                <span className="plain__label">{l.label}</span>
                <a href={l.href} {...(l.href.startsWith("http") ? external : {})}>
                  {l.value}
                </a>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
