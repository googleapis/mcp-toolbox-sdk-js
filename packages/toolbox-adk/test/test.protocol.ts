// // Copyright 2025 Google LLC
// //
// // Licensed under the Apache License, Version 2.0 (the "License");
// // you may not use this file except in compliance with the License.
// // You may obtain a copy of the License at
// //
// //      http://www.apache.org/licenses/LICENSE-2.0
// //
// // Unless required by applicable law or agreed to in writing, software
// // distributed under the License is distributed on an "AS IS" BASIS,
// // WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// // See the License for the specific language governing permissions and
// // limitations under the License.

// import {Type} from '@google/genai';
// import {ConvertZodToFunctionDeclaration} from '../src/toolbox_adk/protocol.js';

// describe('ADK Protocol Converters', () => {
//   describe('ConvertZodToFunctionDeclaration', () => {
//     it('should correctly convert a Zod schema with mixed types...', () => {
//       const result = ConvertZodToFunctionDeclaration(/*...*/);
//       const {parameters} = result;
//       expect(parameters).toBeDefined();

//       expect(parameters!.type).toBe(Type.OBJECT);
//       const {properties} = parameters!;
//       expect(properties.query.type).toBe(Type.STRING);

//       expect(parameters!.required).toEqual(['query', 'page', 'tags', 'config']);
//       expect(parameters!.required).not.toContain('isUrgent');
//     });

//     it('should handle an empty Zod schema gracefully', () => {
//       const result = ConvertZodToFunctionDeclaration(/*...*/);

//       expect(result.parameters!.type).toBe(Type.OBJECT);
//       expect(result.parameters!.properties).toEqual({});
//       expect(result.parameters!.required).toEqual([]);
//     });

//     it('should produce an empty required array if all fields are optional', () => {
//       // ...
//       const result = ConvertZodToFunctionDeclaration(/*...*/);

//       expect(result.parameters!.properties.name.type).toBe(Type.STRING);
//       expect(result.parameters!.required).toEqual([]);
//     });

//     it('should correctly identify all fields as required', () => {
//       // ...
//       const result = ConvertZodToFunctionDeclaration(/*...*/);

//       expect(result.parameters!.required).toHaveLength(2);
//       expect(result.parameters!.required).toEqual(['id', 'value']);
//     });
//   });
// });