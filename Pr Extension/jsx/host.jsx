// --- jsx/host.jsx ---

function getJsonFilePath() {
    if (!app.project || !app.project.path) return null;
    return app.project.path.substring(0, app.project.path.lastIndexOf('.')) + "_KinoData.json";
}

function loadKinoData() {
    var jsonPath = getJsonFilePath();
    if (!jsonPath) return "";
    var file = new File(jsonPath);
    if (file.exists) {
        file.encoding = "UTF-8";
        file.open("r");
        var content = file.read();
        file.close();
        return content;
    }
    return "";
}

function saveKinoData(encodedData) {
    var jsonPath = getJsonFilePath();
    if (!jsonPath) return "ERREUR_PROJET_NON_SAUVEGARDE";
    try {
        var file = new File(jsonPath);
        file.encoding = "UTF-8";
        file.open("w");
        file.write(decodeURIComponent(encodedData));
        file.close();
        return "SUCCESS";
    } catch (e) {
        return "ERREUR|" + e.toString();
    }
}

// ------------------------------------------------------------------
// NOUVEAU : Récupération blindée des rushs (sans utiliser JSON natif)
// ------------------------------------------------------------------
function getSelectionForAnalysis() {
    try {
        if (!app.project) return "[]";
        var items = [];
        var viewSel = app.getCurrentProjectViewSelection();
        
        if (viewSel && viewSel.length > 0) {
            for (var i = 0; i < viewSel.length; i++) {
                var item = viewSel[i];
                if (item.type === ProjectItemType.CLIP || item.type === ProjectItemType.FILE) {
                    var path = item.getMediaPath();
                    if (path && path !== "") {
                        // Détection Vidéo / Audio compatible avec les vieilles API
                        var mType = "Audio";
                        try { if (item.hasVideo()) mType = "Video"; } catch(e) {}
                        
                        // Sécurisation des chemins Windows (Antislashs)
                        var cPath = path.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
                        var cName = item.name.replace(/"/g, "\\\"");
                        var cId = item.nodeId ? item.nodeId : i.toString();
                        
                        // Construction manuelle de la chaîne JSON
                        items.push('{"id":"' + cId + '", "name":"' + cName + '", "path":"' + cPath + '", "mediaType":"' + mType + '"}');
                    }
                }
            }
        }
        return "[" + items.join(",") + "]";
    } catch(e) {
        return "ERROR|" + e.toString();
    }
}

function getLabelColorIndex(avisStr) {
    if (avisStr.indexOf("MASTER") !== -1) return 14;     
    if (avisStr.indexOf("OK") !== -1) return 10;         
    if (avisStr.indexOf("Moyen") !== -1) return 9;       
    if (avisStr.indexOf("Bof") !== -1) return 8;         
    if (avisStr.indexOf("KO") !== -1) return 15;         
    if (avisStr.indexOf("vérifier") !== -1) return 7;    
    return 10;
}

function getOrCreateBin(parentBin, binName) {
    for (var i = 0; i < parentBin.children.numItems; i++) {
        var item = parentBin.children[i];
        if (item.type === ProjectItemType.BIN && item.name === binName) return item;
    }
    return parentBin.createBin(binName);
}

function findItemByPath(bin, searchPath) {
    for (var i = 0; i < bin.children.numItems; i++) {
        var item = bin.children[i];
        if (item.type === ProjectItemType.BIN) {
            var found = findItemByPath(item, searchPath);
            if (found) return found;
        } else if (item.getMediaPath && item.getMediaPath() === searchPath) {
            return item;
        }
    }
    return null;
}

// ------------------------------------------------------------------
// NOUVEAU : Traitement des rushs avec parseur de secours
// ------------------------------------------------------------------
function processAnalyzedRushes(matchedEncoded, unmatchedEncoded) {
    if (!app.project) return "Erreur|Aucun projet ouvert.";
    
    var matchedList = [];
    var unmatchedList = [];
    
    // Utilisation de "eval" comme solution de secours robuste pour Premiere Pro
    try { matchedList = eval("(" + decodeURIComponent(matchedEncoded) + ")"); } catch(e){}
    try { unmatchedList = eval("(" + decodeURIComponent(unmatchedEncoded) + ")"); } catch(e){}
    
    if (unmatchedList.length > 0) {
        var unrecBin = getOrCreateBin(app.project.rootItem, "NON RECONNUS (Échecs Synchro)");
        for (var i = 0; i < unmatchedList.length; i++) {
            var pItem = findItemByPath(app.project.rootItem, unmatchedList[i].path);
            if (pItem) pItem.moveBin(unrecBin);
        }
    }

    if (matchedList.length === 0) return "SUCCESS|Organisation terminée (0 fichiers reconnus).";

    var dbRaw = loadKinoData();
    var db = null;
    try { db = eval("(" + dbRaw + ")"); } catch(e){}
    if (!db) return "Erreur|Impossible de charger les données du script.";

    var seqGroups = {};
    for (var i = 0; i < matchedList.length; i++) {
        var m = matchedList[i];
        if (!seqGroups[m.seqId]) seqGroups[m.seqId] = [];
        seqGroups[m.seqId].push(m);
    }

    var totalOrganized = 0;

    for (var sIdStr in seqGroups) {
        if (!seqGroups.hasOwnProperty(sIdStr)) continue;
        var sId = parseInt(sIdStr);
        var rushesForSeq = seqGroups[sIdStr];

        var seqBin = getOrCreateBin(app.project.rootItem, "SEQUENCE " + sId);
        var videoBin = getOrCreateBin(seqBin, "VIDEO");
        var audioBin = getOrCreateBin(seqBin, "AUDIO");
        var timelineGroups = {};

        for (var j = 0; j < rushesForSeq.length; j++) {
            var rush = rushesForSeq[j];
            var pItem = findItemByPath(app.project.rootItem, rush.path);
            
            if (pItem) {
                pItem.moveBin(rush.mediaType === "Video" ? videoBin : audioBin);
                
                var take = null;
                for (var t = 0; t < db.takes.length; t++) {
                    if (db.takes[t].seqId === rush.seqId && db.takes[t].planId === rush.planId && db.takes[t].prise === rush.priseId) {
                        take = db.takes[t];
                        break;
                    }
                }

                if (take) {
                    pItem.setColorLabel(getLabelColorIndex(take.avis));
                    var newName = rush.seqId + "." + rush.planId + "." + rush.priseId + "_" + pItem.name.replace(/^\d+\.\d+\.\d+_/, '');
                    pItem.name = newName;
                    
                    if (!take.rushes) take.rushes = [];
                    var rushAlreadySaved = false;
                    for (var rk = 0; rk < take.rushes.length; rk++) { if (take.rushes[rk] === newName) rushAlreadySaved = true; }
                    if (!rushAlreadySaved) take.rushes.push(newName);
                }

                var takeKey = rush.planId + "_" + rush.priseId;
                if (!timelineGroups[takeKey]) timelineGroups[takeKey] = [];
                rush.pItem = pItem;
                timelineGroups[takeKey].push(rush);
                totalOrganized++;
            }
        }

        var newSeqName = "SÉQUENCE " + sId + " - SYNCHRO";
        var seqObj = app.project.createNewSequence(newSeqName, "");
        if (seqObj) {
            for(var r=0; r < app.project.rootItem.children.numItems; r++) {
                var it = app.project.rootItem.children[r];
                if(it.type === ProjectItemType.SEQUENCE && it.name === newSeqName) {
                    it.moveBin(seqBin); break;
                }
            }

            var currentTime = 0;
            var keys = [];
            for (var k in timelineGroups) { if(timelineGroups.hasOwnProperty(k)) keys.push(k); }
            keys.sort(function(a, b) {
                var partA = a.split('_'); var partB = b.split('_');
                var pA = parseInt(partA[0]), prA = parseInt(partA[1]);
                var pB = parseInt(partB[0]), prB = parseInt(partB[1]);
                if (pA !== pB) return pA - pB;
                return prA - prB;
            });

            for (var x = 0; x < keys.length; x++) {
                var groupRushes = timelineGroups[keys[x]];
                var audioOffset = 0;
                var maxDuration = 0;

                for (var y = 0; y < groupRushes.length; y++) {
                    var currR = groupRushes[y];
                    currR.pItem.setInPoint(currR.beepTime, 4); 

                    if (currR.mediaType === "Video") {
                        seqObj.videoTracks[0].overwriteClip(currR.pItem, currentTime);
                        var insertedClip = seqObj.videoTracks[0].clips[seqObj.videoTracks[0].clips.numItems - 1];
                        var dur = insertedClip.end.seconds - insertedClip.start.seconds;
                        if (dur > maxDuration) maxDuration = dur;
                    } else if (currR.mediaType === "Audio") {
                        if (audioOffset < seqObj.audioTracks.numTracks) {
                            seqObj.audioTracks[audioOffset].overwriteClip(currR.pItem, currentTime);
                            var insertedClipAudio = seqObj.audioTracks[audioOffset].clips[seqObj.audioTracks[audioOffset].clips.numItems - 1];
                            var durAudio = insertedClipAudio.end.seconds - insertedClipAudio.start.seconds;
                            if (durAudio > maxDuration) maxDuration = durAudio;
                            audioOffset++;
                        }
                    }
                    currR.pItem.clearInPoint(); 
                }
                currentTime += maxDuration;
            }
        }
    }

    var cleanJson = JSON_stringify_fallback(db);
    saveKinoData(encodeURIComponent(cleanJson));
    return "SUCCESS|Organisation terminée ! " + totalOrganized + " rush(s) traité(s).";
}

// Outil de secours pour transformer la DB en texte
function JSON_stringify_fallback(obj) {
    var arr = [];
    for (var key in obj) {
        if (obj.hasOwnProperty(key)) {
            var val = obj[key];
            if (typeof val === 'string') arr.push('"' + key + '":"' + val.replace(/"/g, '\\"') + '"');
            else if (typeof val === 'number') arr.push('"' + key + '":' + val);
            else if (Object.prototype.toString.call(val) === '[object Array]') {
                var subArr = [];
                for (var k=0; k<val.length; k++) subArr.push(JSON_stringify_fallback(val[k]));
                arr.push('"' + key + '":[' + subArr.join(',') + ']');
            } else if (typeof val === 'object') {
                arr.push('"' + key + '":' + JSON_stringify_fallback(val));
            }
        }
    }
    return '{' + arr.join(',') + '}';
}