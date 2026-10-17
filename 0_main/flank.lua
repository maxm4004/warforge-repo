-- ============================================================
-- NEMICO SU FIANCO/RETRO (modificatore di morale -2)
-- Regolamento: "Nemico in contatto sul fianco/retro o in grado
-- di caricare un fianco/retro nel turno successivo".
-- Carica sul fianco: chi carica ha almeno due basi interamente
-- dietro il prolungamento della linea del fronte del bersaglio.
-- Geometria a rettangoli dichiarati (unit_types), assi nativi
-- TTS; tipo letto dal nome della base, nessun JSON decodificato.
-- ============================================================
IEF_FLANK_CONTACT_INCHES = 0.05   -- basi a contatto

-- ============================================================
-- FUNZIONE: main_baseRectOfType(obj, tipo)
-- Come main_baseRect, ma con il tipo già noto. Aggiunge i 4
-- vertici (corners) sul piano XZ.
-- ============================================================
function main_baseRectOfType(obj, tipo)
    local ut = main_getUnitType(tipo)
    local widthCm = (ut and ut.base_width_cm) or 4
    local depthCm = (ut and ut.base_depth_cm) or 3

    local p = obj.getPosition()
    local f = obj.getTransformForward()
    local r = obj.getTransformRight()
    local fXZ = Vector(f.x, 0, f.z):normalized()
    local rXZ = Vector(r.x, 0, r.z):normalized()

    local rect = {
        x = p.x, z = p.z,
        fx = fXZ.x, fz = fXZ.z,
        rx = rXZ.x, rz = rXZ.z,
        hw = widthCm * CM_TO_TTS / 2,
        hd = depthCm * CM_TO_TTS / 2,
        obj = obj,
    }
    rect.corners = {}
    for _, sw in ipairs({ -1, 1 }) do
        for _, sd in ipairs({ -1, 1 }) do
            table.insert(rect.corners, {
                x = rect.x + rect.rx * rect.hw * sw + rect.fx * rect.hd * sd,
                z = rect.z + rect.rz * rect.hw * sw + rect.fz * rect.hd * sd,
            })
        end
    end
    return rect
end

-- ============================================================
-- FUNZIONE: main_pointRectDistance(px, pz, r)
-- Distanza (unità TTS) da un punto al rettangolo r; 0 se dentro.
-- ============================================================
function main_pointRectDistance(px, pz, r)
    local dx, dz = px - r.x, pz - r.z
    local ex = math.max(math.abs(dx * r.rx + dz * r.rz) - r.hw, 0)
    local ef = math.max(math.abs(dx * r.fx + dz * r.fz) - r.hd, 0)
    return math.sqrt(ex * ex + ef * ef)
end

-- ============================================================
-- FUNZIONE: main_rectsDistance(a, b)
-- Distanza minima bordo-bordo (unità TTS) fra due rettangoli:
-- il minimo è sempre su un vertice di uno dei due.
-- ============================================================
function main_rectsDistance(a, b)
    local m = math.huge
    for _, c in ipairs(a.corners) do
        local d = main_pointRectDistance(c.x, c.z, b)
        if d < m then m = d end
    end
    for _, c in ipairs(b.corners) do
        local d = main_pointRectDistance(c.x, c.z, a)
        if d < m then m = d end
    end
    return m
end

-- ============================================================
-- FUNZIONE: main_canChargeType(tipoCheCarica, tipoBersaglio)
-- Limitazioni di carica: ART mai; FL solo FL, ART, EL.
-- ============================================================
function main_canChargeType(tipoCheCarica, tipoBersaglio)
    if tipoCheCarica == "ART" or tipoCheCarica == "GEN" then return false end
    if tipoCheCarica == "FL" and tipoBersaglio ~= "FL"
       and tipoBersaglio ~= "ART" and tipoBersaglio ~= "EL" then
        return false
    end
    return true
end

-- ============================================================
-- FUNZIONE: main_unitsInMelee()
-- Insieme delle unità presenti in IEF_MELEE_LIST.
-- ============================================================
function main_unitsInMelee()
    local out = {}
    for _, e in ipairs(IEF_MELEE_LIST or {}) do
        out[e.unitArmy1Key] = true
        out[e.unitArmy2Key] = true
    end
    return out
end

-- ============================================================
-- FUNZIONE: main_enemyOnFlankOrRear(unitKey)
-- True se una unità nemica (non Generale, non in ROTTA):
-- a) è a contatto con una base dell'unità e il centro della sua
--    base sta dietro la linea del fronte (contatto sul fianco o
--    sul retro);
-- b) oppure non è in mischia, può caricare l'unità (ART mai, FL
--    solo FL/ART/EL), ha almeno 2 basi interamente dietro il
--    prolungamento della linea del fronte ed è entro la sua
--    mossa (in grado di caricare un fianco/retro). Nessun
--    controllo del raggio di comando.
-- Linea del fronte = proiezione massima dei vertici delle basi
-- lungo il fronte dell'unità.
-- ============================================================
function main_enemyOnFlankOrRear(unitKey)
    -- Una sola passata sugli oggetti: unità per chiave
    local unita = {}
    for _, o in ipairs(getAllObjects()) do
        local info = main_parseNickname(o.getName())
        if info then
            local s = (o.hasTag("Army1") and 1) or (o.hasTag("Army2") and 2) or nil
            if s then
                local key = main_getUnitKey(o)
                local u = unita[key]
                if not u then
                    u = { slot = s, tipo = info.unitType, basi = {} }
                    unita[key] = u
                end
                table.insert(u.basi, o)
            end
        end
    end

    local mia = unita[unitKey]
    if not mia or #mia.basi == 0 then return false end

    local mieRect = {}
    for _, b in ipairs(mia.basi) do
        table.insert(mieRect, main_baseRectOfType(b, mia.tipo))
    end
    local fx, fz = mieRect[1].fx, mieRect[1].fz

    local fronte = -math.huge
    for _, r in ipairs(mieRect) do
        for _, c in ipairs(r.corners) do
            local s = c.x * fx + c.z * fz
            if s > fronte then fronte = s end
        end
    end

    local tol = IEF_FLANK_CONTACT_INCHES * INCH_TO_TTS
    local inMischia = main_unitsInMelee()

    for key, u in pairs(unita) do
        if u.slot ~= mia.slot and u.tipo ~= "GEN" and not main_isGeneralKey(key)
           and main_getCohesion(key) ~= COHESION.ROT then

            local rects = {}
            for _, b in ipairs(u.basi) do
                table.insert(rects, main_baseRectOfType(b, u.tipo))
            end

            -- a) contatto sul fianco/retro
            for _, er in ipairs(rects) do
                if er.x * fx + er.z * fz < fronte then
                    for _, mr in ipairs(mieRect) do
                        if main_rectsDistance(mr, er) <= tol then return true end
                    end
                end
            end

            -- b) in grado di caricare un fianco/retro
            if not inMischia[key] and main_canChargeType(u.tipo, mia.tipo) then
                local dietro = 0
                for _, er in ipairs(rects) do
                    local tutta = true
                    for _, c in ipairs(er.corners) do
                        if c.x * fx + c.z * fz > fronte + tol then tutta = false; break end
                    end
                    if tutta then dietro = dietro + 1 end
                end

                if dietro >= 2 then
                    local ut = main_getUnitType(u.tipo)
                    local mossa = ((ut and ut.move_inches) or 0) * INCH_TO_TTS + tol
                    for _, er in ipairs(rects) do
                        for _, mr in ipairs(mieRect) do
                            if main_rectsDistance(mr, er) <= mossa then return true end
                        end
                    end
                end
            end
        end
    end
    return false
end
