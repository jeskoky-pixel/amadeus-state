import test from 'node:test';
import assert from 'node:assert/strict';
import Schemastery from '@deepseek-ai/schemastery';
import {Config} from '../src/config-schema.js';

test('Desktop schema rehydration retains valid State settings between UI increments', () => {
 const values={eventSensitivity:0.33,autoEventMinIntervalSeconds:61};
 const checked=Config['~standard'].validate(values);
 assert.equal(checked.issues,undefined);
 assert.doesNotThrow(()=>new Schemastery(Config.toJSON())(values));
 assert.throws(()=>new Schemastery(Config.toJSON())({...values,eventSensitivity:Infinity}));
 assert.throws(()=>new Schemastery(Config.toJSON())({...values,eventSensitivity:-1}));
});
