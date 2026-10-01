-- ─── SEED: DANGER ZONES AROUND LEIRIA, PORTUGAL ─────────────────────────────
-- Mirrors the mock GeoJSON data in safety-app/services/mapService.ts exactly
-- so the app's risk colours match after the real API is wired up.
-- Run once after migrations; safe to run again (ON CONFLICT DO NOTHING).

INSERT INTO danger_zones (id, label, risk_level, geom) VALUES

-- High risk — city centre block (same coords as mock zone 1)
(
    'a1000000-0000-0000-0000-000000000001',
    'Leiria City Centre',
    'high',
    ST_Multi(ST_GeomFromGeoJSON('{
        "type": "Polygon",
        "coordinates": [[
            [-8.8100, 39.7460],
            [-8.8050, 39.7460],
            [-8.8050, 39.7420],
            [-8.8100, 39.7420],
            [-8.8100, 39.7460]
        ]]
    }'))::GEOMETRY(MultiPolygon, 4326)
),

-- Medium risk — west residential (mock zone 2)
(
    'a1000000-0000-0000-0000-000000000002',
    'Zona Oeste',
    'medium',
    ST_Multi(ST_GeomFromGeoJSON('{
        "type": "Polygon",
        "coordinates": [[
            [-8.8200, 39.7500],
            [-8.8120, 39.7500],
            [-8.8120, 39.7450],
            [-8.8200, 39.7450],
            [-8.8200, 39.7500]
        ]]
    }'))::GEOMETRY(MultiPolygon, 4326)
),

-- Low risk — south park area (mock zone 3)
(
    'a1000000-0000-0000-0000-000000000003',
    'Parque da Cidade',
    'low',
    ST_Multi(ST_GeomFromGeoJSON('{
        "type": "Polygon",
        "coordinates": [[
            [-8.8080, 39.7380],
            [-8.7990, 39.7380],
            [-8.7990, 39.7340],
            [-8.8080, 39.7340],
            [-8.8080, 39.7380]
        ]]
    }'))::GEOMETRY(MultiPolygon, 4326)
),

-- High risk — industrial north (mock zone 4)
(
    'a1000000-0000-0000-0000-000000000004',
    'Zona Industrial Norte',
    'high',
    ST_Multi(ST_GeomFromGeoJSON('{
        "type": "Polygon",
        "coordinates": [[
            [-8.8150, 39.7560],
            [-8.8060, 39.7560],
            [-8.8060, 39.7510],
            [-8.8150, 39.7510],
            [-8.8150, 39.7560]
        ]]
    }'))::GEOMETRY(MultiPolygon, 4326)
)

ON CONFLICT (id) DO NOTHING;
