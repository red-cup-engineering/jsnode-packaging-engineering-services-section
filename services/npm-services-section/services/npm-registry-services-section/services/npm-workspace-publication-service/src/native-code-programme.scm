;;; Original Code constructor. Portable runtime contracts are independent.
(define-module (native-code-programme)
  #:use-module (guix gexp)
  #:use-module (guix store)
  #:use-module (guix packages)
  #:use-module (guix derivations)
  #:use-module (guix monads)
  #:use-module (guix build-system trivial)
  #:use-module (gnu packages bash)
  #:use-module (json)
  #:use-module (rnrs bytevectors)
  #:use-module (ice-9 popen)
  #:use-module (ice-9 textual-ports)
  #:use-module (srfi srfi-1)
  #:use-module (srfi srfi-9)
  #:use-module (srfi srfi-13)
  #:export (native-code-provider-inputs native-code-source-construction native-code-construction native-code-construction?
            native-code-construction-input receive-native-code-output
            native-code-product? native-code-product-input native-code-product-source native-code-product-binds-source?
            native-code-product-programme-runtime native-code-product-entry))

(define-record-type <native-code-construction>
  (%construction input source entry roots observations command node receipt)
  native-code-construction?
  (input native-code-construction-input)
  (source construction-source)
  (entry construction-entry)
  (roots construction-roots)
  (observations construction-observations)
  (command construction-command)
  (node construction-node)
  (receipt construction-receipt))
(define-record-type <native-code-product>
  (%product input source entry receiving)
  %native-code-product?
  (input %native-code-product-input)
  (source %native-code-product-source)
  (entry %native-code-product-entry)
  (receiving product-receiving))
;; Ordinary procedure exports remain callable through the original CDE module seam.
(define (native-code-product? value) (%native-code-product? value))
(define (native-code-product-input value) (%native-code-product-input value))
(define (native-code-product-source value) (%native-code-product-source value))
(define (native-code-product-entry value) (%native-code-product-entry value))
(define (native-code-product-binds-source? product source)
  (and (native-code-product? product) (string? source)
       (or (equal? source (native-code-product-input product))
           (equal? source (native-code-product-source product)))))
(define (native-code-product-programme-runtime product)
  (stored-file (string-append (native-code-product-input product) "/.native-code/run")))

;; The module loader selects Code's source. Reader debug positions may be
;; disabled by the native caller and cannot identify construction inputs.
(define %module-file
  (let ((source (%search-load-path "native-code-programme.scm")))
    (unless source (error "original native Code module source is not selected"))
    (canonicalize-path source)))
(define %directory (dirname %module-file))
(define (own name) (canonicalize-path (string-append %directory "/" name)))
(define (json-file file)
  (call-with-input-file file json->scm))
(define (store-root file)
  (let ((parts (string-split file #\/)))
    (unless (and (>= (length parts) 4) (equal? (take parts 3) '("" "gnu" "store")))
      (error "native Code input is not a store path" file))
    (let ((root (string-join (take parts 4) "/")))
      (unless (direct-store-path? root) (error "invalid native store item" root))
      root)))
;; A registered store input is a reference, never a recursive local import.
(define-record-type <registered-store-input>
  (%registered-store-input root suffix)
  registered-store-input?
  (root registered-store-input-root)
  (suffix registered-store-input-suffix))
(define-gexp-compiler registered-store-input-compiler <registered-store-input>
  compiler => (lambda (input system target)
    (let ((root (registered-store-input-root input)))
      (with-store store
        (unless (valid-path? store root) (error "native Code input no longer registered" root)))
      (with-monad %store-monad (return root))))
  expander => (lambda (input lowered output)
    (string-append lowered (registered-store-input-suffix input))))
(define (stored-file file)
  (let ((root (store-root file)))
    (%registered-store-input root (string-drop file (string-length root)))))
(define (receive-store-roots roots)
  (with-store store
    (map (lambda (root)
      (unless (and (direct-store-path? root) (valid-path? store root))
        (error "native Code provider is not registered" root))
      ;; Native store metadata; no NAR serialization or payload copying.
      `((path . ,root)
        (nar-sha256 . ,(list->vector (bytevector->u8-list (query-path-hash store root))))
        (references . ,(list->vector (sort (references store root) string<?)))))
      roots)))

;; Native context subjects are issued only after this original store receiver.
;; Their JSON projection is advisory; construction re-receives every subject.
(define-record-type <native-provider-context>
  (%native-provider-context anchor source directory closure)
  native-provider-context?
  (anchor provider-context-anchor)
  (source provider-context-source)
  (directory provider-context-directory)
  (closure provider-context-closure))
(define (native-code-provider-inputs bill-file incumbent-package)
  (let* ((bill (json-file bill-file))
         (bindings (vector->list (assoc-ref bill "bindings")))
         (subjects '()) (anchors '())
         (incumbent-root (store-root incumbent-package)))
    (with-store store
      (define (closed root)
        (unless (and (direct-store-path? root) (valid-path? store root))
          (error "native context anchor is not registered" root))
        (or (assoc-ref anchors root)
            (let ((paths (sort (delete-duplicates (requisites store (list root))) string<?)))
              (unless (and (member root paths)
                           (every (lambda (p) (valid-path? store p)) paths))
                (error "native context reference closure is unreceived" root))
              (set! anchors (acons root paths anchors)) paths)))
      (unless (valid-path? store incumbent-root)
        (error "native incumbent context is not registered" incumbent-root))

      (for-each
       (lambda (binding)
        (unless (eq? #t (assoc-ref binding "absent"))
          (let* ((directory (assoc-ref binding "directory"))
                 (source (store-root directory))
                 (anchor (or (assoc-ref binding "contextRoot") source))
                 (paths (if (assoc-ref binding "contextRoot") (closed anchor)
                            (begin
                              (unless (valid-path? store source)
                                (error "native package source is not registered" source))
                              (list source)))))
            (unless (and (equal? directory (canonicalize-path directory))
                         (member source paths))
              (error "package source item is outside its native context anchor closure"
                     directory anchor))
            (set! subjects
              (cons (%native-provider-context anchor source directory paths) subjects)))))
       bindings)
      (let* ((roots (sort (delete-duplicates
                            (cons incumbent-root (append-map provider-context-closure subjects))) string<?))
             (observations (receive-store-roots roots)))
        `((kind . "npm.native-provider-inputs.observed/v1")
          (roots . ,(list->vector roots))
          (contexts . ,(list->vector
            (map (lambda (subject)
              `((anchor . ,(provider-context-anchor subject))
                (source . ,(provider-context-source subject))
                (directory . ,(provider-context-directory subject))))
             (reverse subjects))))
          (anchors . ,(list->vector
            (map (lambda (entry)
              `((root . ,(car entry)) (closure . ,(list->vector (cdr entry)))))
             (sort anchors (lambda (a b) (string<? (car a) (car b)))))))
          (store . ,(list->vector observations)))))))

(define (observe command)
  (let* ((port (apply open-pipe* OPEN_READ command))
         (text (get-string-all port))
         (status (close-pipe port)))
    (unless (zero? status) (error "original Code observer refused"))
    (let ((answer (json-string->scm text)))
      (unless (equal? (assoc-ref answer "kind") "npm.native-store-programme.observed/v1")
        (error "original Code observer omitted receiving"))
      answer)))

;; The operation selects these native suppliers. Product JSON cannot replace
;; the observer or native store connection. This is a source-bound worker,
;; not a claim that an installed complete Code package was received.
(define* (native-code-construction source entry
          #:key node-program parser-module policy-module bill-file incumbent-package reuse-product)
  (native-code-construction/internal source entry
    #:node-program node-program #:parser-module parser-module #:policy-module policy-module
    #:bill-file bill-file #:incumbent-package incumbent-package #:reuse-product reuse-product))

;; The trusted operating caller selects this original finite producer. Source
;; and custody references select ordinary Data, never an executable worker.
(define* (native-code-source-construction destination entry
          #:key source-reference custody-reference incumbent-runtime
          node-program parser-module policy-module bill-file incumbent-package)
  (unless (and source-reference custody-reference
               (string? incumbent-runtime)
               (equal? incumbent-runtime (canonicalize-path incumbent-runtime)))
    (error "explicit original source/custody references and incumbent runtime required"))
  (native-code-construction/internal destination entry
    #:node-program node-program #:parser-module parser-module #:policy-module policy-module
    #:bill-file bill-file #:incumbent-package incumbent-package
    #:formation-reference source-reference #:formation-custody custody-reference
    #:incumbent-runtime incumbent-runtime))

(define* (native-code-construction/internal source entry
          #:key node-program parser-module policy-module bill-file incumbent-package reuse-product
          formation-reference formation-custody incumbent-runtime)
  (unless (and (string? source) (absolute-file-name? source)
               (if formation-reference
                 (and (not reuse-product)
                      (equal? (dirname source) (canonicalize-path (dirname source)))
                      (not (file-exists? source)))
                 (equal? source (canonicalize-path source)))
               (string? entry) (not (absolute-file-name? entry))
               (every (lambda (p) (and (not (string-null? p)) (not (member p '("." "..")))))
                      (string-split entry #\/)))
    (error "canonical source/destination and confined native programme entry required"))
  (for-each (lambda (file)
    (unless (and (string? file) (equal? file (canonicalize-path file)))
      (error "canonical original native supplier required" file)))
    (list node-program parser-module policy-module incumbent-package))
  (when (and (not formation-reference) (string-prefix? "/gnu/store/" source))
    (receive-store-roots (list (store-root source))))
  (let* ((provider-inputs (native-code-provider-inputs bill-file incumbent-package))
         (roots (vector->list (assoc-ref provider-inputs 'roots)))
         (worker (own "../scripts/native-code-observer.mjs"))
         (graph-source (own "native-provider-graph.mjs"))
         (reader-source (own "native-registry-imports.mjs"))
         (owner-source (own "installed-contract-owner.mjs"))
         (bill-source (own "native-provider-bill.mjs"))
         (guard-source (own "native-store-resolution-guard.mjs"))
         (encoding-source (own "native-context-encoding.mjs"))
         (producer-source (own "produce-native-package-programme.mjs"))
         (inputs (list node-program parser-module policy-module worker graph-source reader-source owner-source bill-source guard-source encoding-source producer-source))
         (code-roots (delete-duplicates (map store-root (cons %module-file inputs))))
         (all-roots (delete-duplicates (append roots code-roots)))
         (command (append (list node-program "--no-global-search-paths" "--experimental-vm-modules" "--experimental-import-meta-resolve"
                                worker parser-module policy-module graph-source reader-source owner-source bill-source)
                          (list source entry bill-file)))
         (store-observations (receive-store-roots all-roots))
         (preflight (observe
            (if formation-reference
              (append command
                (list (string-append "--form-reference=" (scm->json-string formation-reference))
                      (string-append "--formation-custody=" (scm->json-string formation-custody))
                      (string-append "--provider-roots=" (scm->json-string (list->vector roots)))
                      (string-append "--incumbent-package=" incumbent-package)
                      (string-append "--incumbent-runtime=" incumbent-runtime)))
              command)))
         (manifest (json-file (string-append source "/package.json")))
         (programme (assoc-ref manifest "nativeProgramme"))
         (candidate (and programme (assoc-ref programme "nativeResolution")))
         (graph (and candidate (assoc-ref candidate "moduleGraph")))
         (candidate-roots (and candidate (vector->list (assoc-ref candidate "storeRoots")))))
    (unless (and (equal? source (canonicalize-path source)) candidate
                 (member (assoc-ref candidate "kind")
                   '("npm.native-store-programme.candidate/v1" "npm.native-store-programme.candidate/v2"))
                 (equal? (assoc-ref candidate "profile") "node-guarded/v1")
                 (equal? (assoc-ref candidate "entry") entry)
                 (equal? (assoc-ref graph "replacedPackageRoot") incumbent-package)
                 (equal? roots candidate-roots))
      (error "native candidate differs from the operating source/roots selection"))
    (unless (equal? store-observations (receive-store-roots all-roots))
      (error "native Code inputs changed during original formation/preflight"))
    (let* ((bill-bytes (assoc-ref preflight "billJSON"))
           (bill (plain-file "native-code-provider-bill.json" bill-bytes))
           ;; Issued by this original private constructor from its OWN pinned
           ;; worker plus native store receiving; candidate JSON cannot select it.
           (receiving-input (plain-file "native-code-input-receiving.json"
             (scm->json-string `((kind . "npm.native-code-inputs/v2")
               (roots . ,(list->vector all-roots)) (store . ,(list->vector store-observations))
               (code . ,preflight)))))
           (source-input
             (cond
              (reuse-product
               (unless (and (native-code-product? reuse-product)
                            (equal? store-observations (assoc-ref (product-receiving reuse-product) 'store))
                            (equal? preflight (assoc-ref (product-receiving reuse-product) 'code)))
                 (error "native Code reuse differs before source import"))
               (native-code-product-source reuse-product))
              ((string-prefix? "/gnu/store/" source) (stored-file source))
              (else (local-file source "native-code-source" #:recursive? #t))))
           (observer-inputs (map stored-file inputs))
           (product
            (computed-file "native-code-programme"
             (with-imported-modules '((guix build utils))
              #~(begin
                  (use-modules (guix build utils) (ice-9 format) (ice-9 ftw))
                  ;; Existing providers are explicit store inputs. Never use
                  ;; local-file on a provider subtree or serialize its payload.
                  (let ((providers (list #$@roots))
                        (out #$output)
                        (source #$source-input)
                        (node #$(stored-file node-program))
                        (worker #$(stored-file worker)))
                    (apply invoke node "--no-global-search-paths" "--experimental-vm-modules" "--experimental-import-meta-resolve" worker
                      (append
                       (list #$(stored-file parser-module) #$(stored-file policy-module)
                             #$(stored-file graph-source) #$(stored-file reader-source)
                             #$(stored-file owner-source) #$(stored-file bill-source))
                       (list source #$entry #$bill (string-append "--native-receipt=" #$receiving-input) "--summary")))
                    (when (file-exists? (string-append source "/.native-code"))
                      (error "native source overlaps reserved Code output"))
                    (mkdir out)
                    (for-each (lambda (name)
                      (unless (member name '("." ".."))
                        (symlink (string-append source "/" name) (string-append out "/" name))))
                      (scandir source))
                    (mkdir (string-append out "/.native-code"))
                    (symlink source (string-append out "/.native-code/source"))
                    (copy-file #$receiving-input (string-append out "/.native-code/receiving.json"))
                    (copy-file #$bill (string-append out "/.native-code/provider-bill.json"))
                    (copy-file #$(stored-file guard-source) (string-append out "/.native-code/guard.mjs"))
                    (call-with-output-file (string-append out "/.native-code/bootstrap.mjs")
                      (lambda (port)
                        (display
                         "import fs from 'node:fs';import path from 'node:path';import{fileURLToPath}from'node:url';import{installNativeStoreResolutionGuard}from'./guard.mjs';const product=path.dirname(path.dirname(fileURLToPath(import.meta.url)));const root=fs.realpathSync(path.join(product,'.native-code/source'));const r=JSON.parse(fs.readFileSync(path.join(product,'.native-code/receiving.json'),'utf8')).code;installNativeStoreResolutionGuard({root,packageScopes:r.packageScopes,replacedPackageRoot:r.replacedPackageRoot,retainedContextEdges:r.retainedContextEdges??[],nodeVersion:r.node,bootstrapPath:fileURLToPath(import.meta.url)});\n"
                         port)))
                    (call-with-output-file (string-append out "/.native-code/run")
                      (lambda (port)
                        (format port "#!~a~%set -f~%if [ -n \"${NODE_PATH-}\" ]; then exit 78; fi~%case ${NODE_PRESERVE_SYMLINKS-0} in ''|0) ;; *) exit 78;; esac~%for option in ${NODE_OPTIONS-}; do case \"$option\" in --disable-sigusr1|--enable-source-maps) ;; --max-old-space-size=*) value=${option#--max-old-space-size=}; case \"$value\" in ''|*[!0-9]*) exit 78;; esac;; *) exit 78;; esac; done~%skip=0; for option in \"$@\"; do if [ \"$skip\" = 1 ]; then skip=0; continue; fi; case \"$option\" in --) break;; -e|--eval|-p|--print|--input-type) skip=1;; --eval=*|--print=*|--input-type=*|--max-old-space-size=*|--enable-source-maps|--disable-sigusr1|--no-global-search-paths|--experimental-vm-modules|--experimental-import-meta-resolve|--no-warnings|--trace-warnings|--trace-deprecation|--trace-uncaught|-v|--version|-h|--help) ;; -*) echo 'unreceived native Node launch mode' >&2; exit 78;; *) break;; esac; done~%exec ~s --no-global-search-paths --import ~s \"$@\"~%"
                          #$(file-append bash-minimal "/bin/sh") node
                          (string-append out "/.native-code/bootstrap.mjs"))))
                    (chmod (string-append out "/.native-code/run") #o555)
                    ;; Reobserve the immutable-source shape after realization.
                    (apply invoke node "--no-global-search-paths" "--experimental-vm-modules" "--experimental-import-meta-resolve" worker
                      (append
                       (list #$(stored-file parser-module) #$(stored-file policy-module)
                             #$(stored-file graph-source) #$(stored-file reader-source)
                             #$(stored-file owner-source) #$(stored-file bill-source))
                       (list source #$entry #$bill (string-append "--native-receipt=" #$receiving-input) "--summary")))))))))

      (unless (equal? store-observations (receive-store-roots all-roots))
        (error "native Code store inputs changed during preflight"))
      (%construction product source entry all-roots
        `((store . ,store-observations) (code . ,preflight) (provider-contexts . ,provider-inputs))
        command node-program receiving-input))))

;; Receiving does not build, switch, activate, restart, or root a live service.
;; The caller retains its original native build/root/unknown-outcome custody.
(define (receive-native-code-output construction output)
  (unless (native-code-construction? construction)
    (error "original Code construction required"))
  (unless (and (direct-store-path? output) (equal? output (canonicalize-path output)))
    (error "direct registered Code output required"))
  (with-store store
    (unless (valid-path? store output) (error "native Code output is unregistered"))
    (let ((expected (run-with-store store (lower-object (native-code-construction-input construction)))))
      (unless (and (derivation? expected) (equal? output (derivation->output-path expected)))
        (error "native Code output differs from the original constructor")))
    (let* ((expected (construction-roots construction))
           (closure (requisites store (list output))))
      (unless (every (lambda (p) (member p closure)) expected)
        (error "native Code output did not retain complete provider/source references"))
      (unless (equal? (assoc-ref (construction-observations construction) 'store)
                      (receive-store-roots expected))
        (error "native Code input store identities changed"))
      (let* ((source (readlink (string-append output "/.native-code/source")))
             (command (construction-command construction))
             (receipt (run-with-store store (lower-object (construction-receipt construction))))
             (received (observe (append (take command (- (length command) 3))
                                  (list source (construction-entry construction) (last command)
                                        (string-append "--native-receipt=" receipt))))))
        (unless (equal? (assoc-ref received "billSHA256")
                        (assoc-ref (assoc-ref (construction-observations construction) 'code) "billSHA256"))
          (error "native Code bill changed after construction"))
        (%product output source
          (string-append "node_modules/"
            (assoc-ref (assoc-ref (json-file (string-append source "/package.json")) "nativeProgramme") "package")
            "/" (construction-entry construction))
          `((code . ,received) (store . ,(assoc-ref (construction-observations construction) 'store))
            (references . ,(references store output))))))))
