import test from 'node:test';
import assert from 'node:assert/strict';
import {isVisible,canModerate,canTransition,dedupeListings} from '../src/domain.mjs';
test('active approved visible',()=>assert.equal(isVisible('active','approved'),true));
test('sold hidden',()=>assert.equal(isVisible('sold','approved'),false));
test('pending hidden',()=>assert.equal(isVisible('active','pending'),false));
test('moderator can moderate',()=>assert.equal(canModerate('moderator'),true));
test('sold cannot reactivate',()=>assert.equal(canTransition('sold','active'),false));
test('same item in multiple circles appears once',()=>assert.equal(dedupeListings([{id:'a'},{id:'a'}]).length,1));
