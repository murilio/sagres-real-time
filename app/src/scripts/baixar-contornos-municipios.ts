/**
 * Baixa o contorno da Paraiba e dos seus 223 municipios e grava um
 * unico GeoJSON estatico em `public/geo/paraiba-municipios.geojson`.
 *
 * Script de execucao unica (`pnpm geo:baixar`), nao um caminho de
 * runtime. O arquivo gerado e versionado no repositorio, igual ao CSV
 * semente de `municipios-tce-pb.csv` — a malha muda por lei estadual de
 * criacao de municipio, nao a cada deploy.
 *
 * Fonte: API de Malhas Territoriais do IBGE (dado oficial, sem
 * ambiguidade de resultado e sem limite de taxa), nao o Nominatim/OSM.
 * O Nominatim foi cogitado e descartado nesta demanda: uma consulta de
 * teste para "Bananeiras" devolveu dois resultados para o mesmo nome —
 * um com `addresstype: "municipality"` (o contorno certo) e outro
 * `addresstype: "city_district"` (um distrito interno) — risco real de
 * gravar o poligono errado em qualquer um dos 223 sem filtrar por isso,
 * alem da politica de uso do Nominatim pedir moderacao para coleta em
 * lote. A malha do IBGE devolve os 223 municipios em uma unica
 * requisicao, sem essa ambiguidade.
 *
 * Cruzamento com `codigo_tce`: a malha do IBGE so tem o codigo IBGE
 * (`codarea`), nao o codigo do TCE-PB que o resto do projeto usa como
 * chave (CLAUDE.md registra que nao existe fonte para `codigo_ibge`).
 * O casamento e feito por nome, normalizado com a mesma funcao do seed
 * (`normalizarNomeMunicipio`) — verificado nesta demanda que os 223
 * nomes do IBGE batem 1:1, sem colisao, contra a semente do TCE.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { lerCsvMunicipios, normalizarNomeMunicipio } from "../seed/municipios";

const CODIGO_UF_PB = "25";

// "intermediaria" equilibra fidelidade visual e tamanho de arquivo:
// os 223 municipios ficam em ~215 KB nesta qualidade, contra ~86 KB em
// "minima" (contorno grosseiro demais para zoom de municipio) e ~840 KB
// em "maxima" (fidelidade que este painel nao precisa).
const QUALIDADE_MALHA = "intermediaria";

const CAMINHO_SAIDA = join(
  __dirname,
  "..",
  "..",
  "public",
  "geo",
  "paraiba-municipios.geojson",
);

type GeoJsonGeometry = { type: string; coordinates: unknown };

type FeatureIbge = {
  type: "Feature";
  properties: { codarea: string };
  geometry: GeoJsonGeometry;
};

type FeatureCollectionIbge = {
  type: "FeatureCollection";
  features: FeatureIbge[];
};

type MunicipioIbge = { id: number; nome: string };

function falhar(mensagem: string): never {
  throw new Error(`baixar-contornos-municipios: ${mensagem}`);
}

async function buscarJson<T>(url: string): Promise<T> {
  const resposta = await fetch(url, {
    headers: {
      "User-Agent":
        "sagres-real-time (projeto de estudo publico; script de carga unica, nao runtime)",
    },
  });
  if (!resposta.ok) {
    falhar(`${url} respondeu ${resposta.status} ${resposta.statusText}`);
  }
  return (await resposta.json()) as T;
}

function urlMalha(intrarregiao?: "municipio"): string {
  const base = `https://servicodados.ibge.gov.br/api/v3/malhas/estados/${CODIGO_UF_PB}`;
  const parametros = new URLSearchParams({
    formato: "application/vnd.geo+json",
    qualidade: QUALIDADE_MALHA,
  });
  if (intrarregiao !== undefined) {
    parametros.set("intrarregiao", intrarregiao);
  }
  return `${base}?${parametros.toString()}`;
}

async function main(): Promise<void> {
  const registrosSeed = lerCsvMunicipios();
  const porNomeNormalizado = new Map(
    registrosSeed.map((r) => [r.nomeNormalizado, r]),
  );

  console.log("baixar-contornos-municipios: baixando contorno da Paraiba...");
  const malhaEstado = await buscarJson<FeatureCollectionIbge>(urlMalha());
  if (malhaEstado.features.length !== 1) {
    falhar(
      `malha do estado veio com ${malhaEstado.features.length} features, esperava 1`,
    );
  }

  console.log("baixar-contornos-municipios: baixando contorno dos 223 municipios...");
  const malhaMunicipios = await buscarJson<FeatureCollectionIbge>(
    urlMalha("municipio"),
  );

  console.log("baixar-contornos-municipios: baixando nomes dos municipios...");
  const nomesIbge = await buscarJson<MunicipioIbge[]>(
    `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${CODIGO_UF_PB}/municipios`,
  );
  const nomePorCodigoIbge = new Map(
    nomesIbge.map((m) => [String(m.id), m.nome]),
  );

  if (malhaMunicipios.features.length !== registrosSeed.length) {
    falhar(
      `malha dos municipios veio com ${malhaMunicipios.features.length} ` +
        `features, esperava ${registrosSeed.length} (mesmo total da semente)`,
    );
  }

  const codigosTceUsados = new Set<string>();
  const featuresMunicipios = malhaMunicipios.features.map((feature) => {
    const codigoIbge = feature.properties.codarea;
    const nome = nomePorCodigoIbge.get(codigoIbge);
    if (nome === undefined) {
      falhar(`codigo IBGE ${codigoIbge} nao apareceu na lista de nomes`);
    }

    const nomeNormalizado = normalizarNomeMunicipio(nome);
    const registro = porNomeNormalizado.get(nomeNormalizado);
    if (registro === undefined) {
      falhar(
        `municipio do IBGE ${JSON.stringify(nome)} (codigo ${codigoIbge}) ` +
          `nao bateu com nenhum nome da semente do TCE-PB`,
      );
    }
    if (codigosTceUsados.has(registro.codigoTce)) {
      falhar(
        `codigo_tce ${registro.codigoTce} (${registro.nome}) recebeu duas ` +
          `features da malha do IBGE — nome duplicado ou colisao de normalizacao`,
      );
    }
    codigosTceUsados.add(registro.codigoTce);

    return {
      type: "Feature" as const,
      properties: {
        tipo: "municipio" as const,
        codigo_tce: registro.codigoTce,
        codigo_ibge: codigoIbge,
        nome: registro.nome,
      },
      geometry: feature.geometry,
    };
  });

  if (codigosTceUsados.size !== registrosSeed.length) {
    falhar(
      `${codigosTceUsados.size} municipios casados, esperava ${registrosSeed.length}`,
    );
  }

  const saida = {
    type: "FeatureCollection" as const,
    // Atribuicao exigida pelo IBGE para reuso da malha territorial —
    // manter junto do dado, nao so em documentacao que pode divergir.
    fonte:
      "IBGE, Malhas Territoriais (https://servicodados.ibge.gov.br/api/docs/malhas), qualidade intermediaria",
    features: [
      {
        type: "Feature" as const,
        properties: {
          tipo: "estado" as const,
          codigo_uf: CODIGO_UF_PB,
          nome: "Paraíba",
        },
        geometry: malhaEstado.features[0]!.geometry,
      },
      ...featuresMunicipios,
    ],
  };

  mkdirSync(join(__dirname, "..", "..", "public", "geo"), { recursive: true });
  // Sem indentacao: e dado gerado e regeneravel por este mesmo script,
  // nao arquivo para editar a mao — indentar so infla o tamanho.
  writeFileSync(CAMINHO_SAIDA, JSON.stringify(saida));

  console.log(
    `baixar-contornos-municipios: gravado ${CAMINHO_SAIDA} com ` +
      `${saida.features.length} features (1 estado + ${featuresMunicipios.length} municipios)`,
  );
}

if (require.main === module) {
  main().catch((erro: unknown) => {
    console.error(erro);
    process.exitCode = 1;
  });
}
