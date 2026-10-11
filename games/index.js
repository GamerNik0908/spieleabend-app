const modules = [require('./duemmste'), require('./board'), require('./bluff')];

const byId = new Map(modules.map((m) => [m.id, m]));

function list() {
  return modules.map((m) => ({
    id: m.id,
    name: m.name,
    short: m.short,
    minPlayers: m.minPlayers,
    options: m.options || [],
  }));
}

function resolveOptions(mod, given = {}) {
  const opts = {};
  for (const o of mod.options || []) {
    let v = Number(given[o.key]);
    if (!Number.isFinite(v)) v = o.default;
    opts[o.key] = Math.max(o.min, Math.min(o.max, Math.round(v)));
  }
  return opts;
}

module.exports = { list, get: (id) => byId.get(id), resolveOptions };
