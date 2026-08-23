// Every decorator this emitter understands is declared by tsp-asyncapi-core.
// This one line forwards them, so `import "tsp-asyncapi";` in a .tsp file
// still brings the whole `AsyncAPI` namespace into scope.
//
// Upstream asks a user to import the library package as well as the emitter.
// This package does not, because the name `tsp-asyncapi` was the emitter's
// before the split and every existing project imports it.
import "tsp-asyncapi-core";
