/** One save-aware route home, shared by the toolbar and Android system Back. */
export function createMobileHomeNavigation({flush, navigate, language=()=> 'zh'}) {
  let pending=null;
  return function returnHome(){
    if(pending)return pending;
    pending=Promise.resolve().then(flush).then(()=>navigate(`assets/mobile/index.html?lang=${language()==='en'?'en':'zh'}`)).finally(()=>{pending=null;});
    return pending;
  };
}
