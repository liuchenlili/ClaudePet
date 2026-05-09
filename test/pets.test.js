const assert = require("node:assert/strict");
const test = require("node:test");

const { listPets, readWebpSize } = require("../src/shared/pets");
const { appRoot } = require("../src/shared/paths");

test("pet manifests include normalized sprite geometry", () => {
  const pets = listPets(appRoot());
  assert.ok(pets.length > 0);
  for (const pet of pets) {
    assert.equal(pet.imageWidth, 1536);
    assert.equal(pet.imageHeight, 1872);
    assert.equal(pet.frameWidth, 192);
    assert.equal(pet.frameHeight, 208);
    assert.equal(pet.columns, 8);
    assert.equal(pet.rows, 9);
    assert.ok(pet.animations.idle.frames.length > 0);
  }
});

test("readWebpSize reads local VP8L spritesheet dimensions", () => {
  const pet = listPets(appRoot())[0];
  assert.deepEqual(readWebpSize(pet.spritesheetFile), { width: 1536, height: 1872 });
});
