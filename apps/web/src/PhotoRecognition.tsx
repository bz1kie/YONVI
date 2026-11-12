type Props={image:File|null;onApply:(title:string,category:string)=>void};
export default function PhotoRecognition({image}:Props){
 return <div className="photo-recognition"><button type="button" className="btn btn-secondary" disabled>Поиск товара по фото временно недоступен</button><small>Автоматический поиск по фотографии будет подключён отдельно.</small></div>;
}
