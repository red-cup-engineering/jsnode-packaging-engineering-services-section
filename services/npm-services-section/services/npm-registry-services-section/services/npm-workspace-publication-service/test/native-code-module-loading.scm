;;; Native source receiving must also work with reader debug positions off.
(use-modules (guix gexp) (guix store) (guix monads) (guix derivations)
             (guix packages) (json) (srfi srfi-1) (srfi srfi-13))
(read-disable 'positions)
(define interface (resolve-interface '(native-code-programme)))
(for-each (lambda (name)
  (unless (procedure? (module-ref interface name))
    (error "original native Code constructor was not received" name)))
  '(native-code-provider-inputs native-code-construction
    native-code-source-construction receive-native-code-output))
(define selected (canonicalize-path (%search-load-path "native-code-programme.scm")))
(unless (equal? selected
  (module-ref (resolve-module '(native-code-programme)) '%module-file))
  (error "Code construction changed its selected module source"))
(display "native Code source selected without reader debug positions\n")
