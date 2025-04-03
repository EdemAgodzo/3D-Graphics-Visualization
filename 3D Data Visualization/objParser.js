"use strict"

/**
 * Adapted from ThinMatrix's tutorial on writing an OBJ parser in Java:
 * https://www.youtube.com/watch?v=YKFYtekgnP8
 * @param {string} file 
 * @param {boolean} useMaterials 
 * @returns An entity build from the OBJ file
 */
async function loadObj(file, useMaterials = true) {
    const objFile = await loadFile(file);
    const lines = objFile.split('\n');

    const objData = {
        indices: [],
        vertices: [],
        textureCoords: [],
        normals: [],
        orderedVertices: [],
        orderedTextureCoords: [],
        orderedNormals: [],
        components: [{
            vertexCount: 0,
            startIndex: 0,
            materialName: "Default"
        }],
        materialFile: "",
    };

    let currentComponent = objData.components[0];

    for (const line of lines) {
        const [prefix, ...data] = line.trim().split(/\s+/); // use regex to handle spacing

        switch (prefix) {
            case "mtllib":
                objData.materialFile = data[0];
                break;
            case "v":
                objData.vertices.push(Number(data[0]), Number(data[1]), Number(data[2]));
                break;
            case "vt":
                objData.textureCoords.push([Number(data[0]), Number(data[1])]);
                break;
            case "vn":
                objData.normals.push([Number(data[0]), Number(data[1]), Number(data[2])]);
                break;
            case "usemtl":
                currentComponent = {
                    vertexCount: 0,
                    startIndex: objData.indices.length,
                    materialName: data[0]
                };
                objData.components.push(currentComponent);
                break;
            case "f":
                for (let i = 0; i < 3; i++) {
                    const parts = data[i].split('/');
                    processVertex(parts, objData);
                }
                currentComponent.vertexCount += 3;
                break;
        }
    }

    if (objData.components[0].vertexCount === 0) {
        objData.components.shift();
    }

    // Load materials if needed
    if (useMaterials && objData.materialFile) {
        const materialFile = file.substring(0, file.lastIndexOf('/') + 1) + objData.materialFile;
        const materials = await parseMaterialFile(materialFile);
        for (const component of objData.components) {
            component.material = materials[component.materialName];
            delete component.materialName;
        }
    }

    // Return the parsed and structured data
    return createEntity(
        objData.indices,
        objData.orderedVertices,
        objData.orderedTextureCoords,
        objData.orderedNormals,
        objData.components
    );
}
/**
 * Process a vertex for a face by updating the indices, texture coordinates, and normals
 * @param vertex The data for the vertex
 * @param objData The data for the object
 */
function processVertex(vertex, objData) {
    const vertexIndex = Number(vertex[0]) - 1;
    const texIndex = Number(vertex[1]) - 1;
    const normIndex = Number(vertex[2]) - 1;

    // Push reordered vertex data
    objData.orderedVertices.push(
        objData.vertices[vertexIndex * 3],
        objData.vertices[vertexIndex * 3 + 1],
        objData.vertices[vertexIndex * 3 + 2]
    );

    objData.orderedTextureCoords.push(
        objData.textureCoords[texIndex][0],
        1 - objData.textureCoords[texIndex][1] // flip V
    );

    objData.orderedNormals.push(
        objData.normals[normIndex][0],
        objData.normals[normIndex][1],
        objData.normals[normIndex][2]
    );

    objData.indices.push(objData.orderedVertices.length / 3 - 1);
}



const IMAGE_FOLDER = "images/";

/**
 * Parse a material file and return a dictionary of the materials is contains
 * @param {string} file The path to the material file 
 * @returns A dictionary mapping material names to materials
 */
async function parseMaterialFile(file) {
    const objFile = await loadFile(file);
    const lines = objFile.split('\n');

    const materials = {};
    let currentMaterial;

    for (const line of lines) {
        const [prefix, ...data] = line.split(' ');

        switch (prefix) {
            case "newmtl":  // Add a new material
                materials[data[0]] = currentMaterial = {};
                break;
            case "Kd":      // Set the material color (This is probably grey if there is a texture)
                materials.color = [Number(data[0]), Number(data[1]), Number(data[2])];
                break  
            case "map_Kd":  // Set the material texture 
                const filename = data[0].split('/').pop();
                // Replace this with a call to your load texture function
                currentMaterial.texture = loadTexture(IMAGE_FOLDER + filename); 
                break;
            // Handle more prefixes here if you want more complex materials
        }
    }

    return materials;
}

async function loadFile(url) {
    const response = await fetch(url);

    if (response.ok) {
        return response.text();
    } else {
        throw `Could not load file: url`;
    }
}

function createEntity(indices, vertices, textureCoords, normals, components) {
    return {
      indices: indices,
      vertices: vertices,
      orderedTextureCoords: textureCoords,
      orderedNormals: normals,
      components: components
    };
  }
  